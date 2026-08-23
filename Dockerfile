FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# patchedDependencies (vaul) — bun install needs the patch files present
COPY patches ./patches
# --ignore-scripts: the only native dep is better-sqlite3, pulled in by the
# evalite dev tool. It is never imported by `bun run build` or by the runner,
# but bun trusts it by default and compiles it from source. Since oven/bun:1
# moved to Node 26 that compile fails on a changed v8::External::Value ABI,
# which broke deploys. Skipping install scripts avoids the build entirely.
RUN bun install --frozen-lockfile --ignore-scripts

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
USER nodejs

COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/data ./data

EXPOSE 3000
CMD ["node", "server.js"]
