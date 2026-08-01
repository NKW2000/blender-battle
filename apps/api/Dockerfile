# syntax=docker/dockerfile:1

# ---- base -------------------------------------------------------------------
FROM node:22-alpine AS base
RUN corepack enable
# A Docker build has no TTY, so anything pnpm wants to confirm interactively it
# instead aborts on. CI=true makes it take the non-interactive branch rather
# than stopping with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. The build
# context is already trimmed so the situation should not arise; this is the
# backstop for builders that do not honour Dockerfile.dockerignore.
ENV CI=true
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Manifests first: this layer is cached until a dependency actually changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# ---- development ------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @bb/shared build
WORKDIR /app/apps/api
CMD ["pnpm", "dev"]

# ---- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @bb/shared build && pnpm --filter @bb/api build
# Drop dev dependencies from the tree that gets copied into the runtime image.
#
# `--legacy` because pnpm 10 changed what `deploy` means: it now expects the
# workspace to set `inject-workspace-packages=true` and refuses otherwise with
# ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE. Injecting would change how every
# install in the repo resolves workspace packages, to fix one line in one
# Dockerfile — the flag keeps the old behaviour, which is the behaviour this
# image was built around.
RUN pnpm --filter @bb/api --prod deploy --legacy /app/pruned

# ---- production -------------------------------------------------------------
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
# Unprivileged user: a container that never needs root should never run as root.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nestjs
COPY --from=build --chown=nestjs:nodejs /app/pruned/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./dist
USER nestjs
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
