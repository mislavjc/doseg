#!/usr/bin/env bash
set -euo pipefail

# Server hardening script for doseg VPS.
# Idempotent - safe to re-run.
#
# Usage (from project root):
#   ssh netcup 'bash -s' < server/harden.sh
#
# Or during initial deploy:
#   scp -r server/ root@host:/tmp/doseg-server
#   ssh root@host 'bash /tmp/doseg-server/harden.sh'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/opt/doseg"

echo "==> Starting server hardening..."

# ---------------------------------------------------------------------------
# 1. UFW Firewall
# ---------------------------------------------------------------------------
echo "==> Configuring firewall (UFW)..."
apt-get update -qq
apt-get install -y -qq ufw > /dev/null

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable without prompt
echo "y" | ufw enable
ufw status verbose

# ---------------------------------------------------------------------------
# 2. fail2ban
# ---------------------------------------------------------------------------
echo "==> Configuring fail2ban..."
apt-get install -y -qq fail2ban > /dev/null

# Use config from repo if available, otherwise use inline default
if [ -f "$SCRIPT_DIR/fail2ban-sshd.conf" ]; then
  cp "$SCRIPT_DIR/fail2ban-sshd.conf" /etc/fail2ban/jail.d/sshd.conf
elif [ -f "$APP_DIR/server/fail2ban-sshd.conf" ]; then
  cp "$APP_DIR/server/fail2ban-sshd.conf" /etc/fail2ban/jail.d/sshd.conf
else
  cat > /etc/fail2ban/jail.d/sshd.conf <<'EOF'
[sshd]
enabled = true
port = ssh
backend = systemd
maxretry = 5
findtime = 600
bantime = 3600
EOF
fi

systemctl enable fail2ban
systemctl restart fail2ban
echo "    fail2ban status: $(systemctl is-active fail2ban)"

# ---------------------------------------------------------------------------
# 3. Unattended upgrades
# ---------------------------------------------------------------------------
echo "==> Configuring unattended-upgrades..."
apt-get install -y -qq unattended-upgrades > /dev/null

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

systemctl enable unattended-upgrades
systemctl restart unattended-upgrades

# ---------------------------------------------------------------------------
# 4. SSH hardening
# ---------------------------------------------------------------------------
echo "==> Hardening SSH..."

if [ -f "$SCRIPT_DIR/ssh-hardening.conf" ]; then
  cp "$SCRIPT_DIR/ssh-hardening.conf" /etc/ssh/sshd_config.d/hardening.conf
elif [ -f "$APP_DIR/server/ssh-hardening.conf" ]; then
  cp "$APP_DIR/server/ssh-hardening.conf" /etc/ssh/sshd_config.d/hardening.conf
else
  cat > /etc/ssh/sshd_config.d/hardening.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
fi

sshd -t && systemctl reload sshd
echo "    SSH config validated and reloaded"

# ---------------------------------------------------------------------------
# 5. Kernel hardening (sysctl)
# ---------------------------------------------------------------------------
echo "==> Hardening kernel parameters..."

if [ -f "$SCRIPT_DIR/sysctl-hardening.conf" ]; then
  cp "$SCRIPT_DIR/sysctl-hardening.conf" /etc/sysctl.d/99-hardening.conf
elif [ -f "$APP_DIR/server/sysctl-hardening.conf" ]; then
  cp "$APP_DIR/server/sysctl-hardening.conf" /etc/sysctl.d/99-hardening.conf
else
  cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv6.conf.all.accept_ra = 0
net.ipv6.conf.default.accept_ra = 0
EOF
fi

sysctl --system > /dev/null 2>&1
echo "    Kernel parameters applied"

# ---------------------------------------------------------------------------
# 6. Docker log rotation
# ---------------------------------------------------------------------------
echo "==> Configuring Docker log rotation..."

if [ -f "$SCRIPT_DIR/docker-daemon.json" ]; then
  cp "$SCRIPT_DIR/docker-daemon.json" /etc/docker/daemon.json
elif [ -f "$APP_DIR/server/docker-daemon.json" ]; then
  cp "$APP_DIR/server/docker-daemon.json" /etc/docker/daemon.json
else
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
EOF
fi

systemctl restart docker
echo "    Docker restarted with log rotation"

# ---------------------------------------------------------------------------
# 7. Swap (2GB)
# ---------------------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
  echo "==> Creating 2GB swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile

  # Persist across reboots
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  # Low swappiness - only use swap under pressure
  sysctl vm.swappiness=10
  if ! grep -q 'vm.swappiness' /etc/sysctl.d/99-hardening.conf; then
    echo 'vm.swappiness = 10' >> /etc/sysctl.d/99-hardening.conf
  fi
  echo "    Swap enabled (2GB)"
else
  echo "    Swap already configured"
fi

# ---------------------------------------------------------------------------
# 8. Wait for services to come back up
# ---------------------------------------------------------------------------
echo "==> Waiting for Docker services to recover..."
sleep 5

cd "$APP_DIR"
timeout 120 bash -c '
  until docker compose ps --format json 2>/dev/null | grep -q healthy; do
    sleep 3
  done
' || true

echo ""
echo "==> Hardening complete. Summary:"
echo "    - UFW firewall: $(ufw status | head -1)"
echo "    - fail2ban: $(systemctl is-active fail2ban)"
echo "    - unattended-upgrades: $(systemctl is-active unattended-upgrades)"
echo "    - SSH: hardened (X11 off, MaxAuthTries 3)"
echo "    - Kernel: hardened (redirects off, rp_filter on)"
echo "    - Docker: log rotation (10MB x 3 files), live-restore"
echo "    - Swap: $(swapon --show --noheadings | awk '{print $3}')"
