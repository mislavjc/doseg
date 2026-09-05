# Sourced, not run. Gives one browser session per worktree so two agents
# driving doseg at once do not fight over tabs and refs, plus an `ab` wrapper
# that carries the session on every command.
#
#   source .claude/skills/verify-doseg/scripts/session.sh
#   ab open https://doseg.localhost/karta
#   ab snapshot -i
#
# Straight from a shell one-liner, the same thing without sourcing:
#   S=$(agent-browser session id --scope worktree --prefix verify-doseg)
#   agent-browser --session "$S" open https://doseg.localhost/
VERIFY_SESSION=${VERIFY_SESSION:-$(agent-browser session id --scope worktree --prefix verify-doseg)}
export VERIFY_SESSION

ab() { agent-browser --session "$VERIFY_SESSION" "$@"; }
