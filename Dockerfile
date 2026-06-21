FROM oven/bun:1 AS deps
WORKDIR /app
# node-gyp toolchain for native deps without a prebuilt binary (e.g.
# better-sqlite3, pulled in by the evalite dev tool). This is a throwaway
# build stage — the toolchain never reaches the runner image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
# patchedDependencies (vaul) — bun install needs the patch files present
COPY patches ./patches
RUN bun install --frozen-lockfile

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
