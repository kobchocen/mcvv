# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global corepack@0.34.0 && corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/env.ts ./src/lib/env.ts
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm test && pnpm build && test -f .next/standalone/server.js

FROM deps AS migration
COPY . .
ENV NODE_ENV=production
USER node
CMD ["node", "--import", "tsx", "scripts/db-migrate.ts"]

FROM node:24.15.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:3000/healthz").then(async r => { if (r.status !== 200 || await r.text() !== "ok") process.exit(1); }).catch(() => process.exit(1))'
CMD ["node", "server.js"]
