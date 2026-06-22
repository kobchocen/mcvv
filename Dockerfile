# ---- Base image (with pnpm via Corepack) ----
FROM node:24.15-alpine AS base

# Enable Corepack so we can use pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# ---- Dependencies layer ----
FROM base AS deps

# Only copy files needed for installing dependencies to maximize cache hits
COPY package.json pnpm-lock.yaml .npmrc ./

# Install all dependencies (dev + prod) for building
RUN pnpm install --frozen-lockfile

# ---- Build layer ----
FROM base AS build

# Reuse installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source code
COPY . .

# Build the Next.js app for production
RUN pnpm build

# ---- Production runtime image ----
FROM node:24.15-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Optional: non-root user (good practice)
# RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# USER nextjs

# Copy only necessary runtime files
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/.npmrc ./.npmrc

# Enable pnpm again in the runtime image
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000

# Start Next.js in production mode
CMD ["pnpm", "start"]
