# Multi-stage build for @verevia/api (NestJS), per
# docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md / docs/PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md.
#
# Build context is the REPO ROOT (not this directory) — this Dockerfile
# uses `turbo prune` to extract only the dependency closure of @verevia/api
# from the pnpm/Turborepo monorepo, so the full workspace source is needed
# at COPY time. Build from the repo root:
#
#   docker build -f infrastructure/docker/api.Dockerfile -t verevia-dev-api .
#
# Published to ghcr.io/mugglman/verevia-api by .github/workflows/deploy-dev.yml
# (Phase 8) — this same image is used both as the persistent api container
# AND, with an overridden command, as the one-off migrate job in
# docker-compose.dev-deploy.yml (`prisma migrate deploy` + seed). That only
# works because `prisma` and `tsx` are regular (not dev) dependencies of
# @verevia/database (see its package.json) — deliberate: a single published
# image beats maintaining a second "fat" migrate-only image just to carry
# two CLI tools, and the size cost is small relative to Node/Nest itself.
#
# Four stages:
#   1. pruner    — computes the minimal pnpm-workspace subset for @verevia/api
#   2. builder   — full install (incl. devDependencies) of that subset, runs
#                  the real `turbo run build` (tsc/nest build + prisma generate)
#   3. prod-deps — a SEPARATE, production-only install of the same subset
#                  (no devDependencies in the final image — prisma/tsx ARE
#                  included, see above), then re-runs `prisma generate`
#                  against that fresh node_modules (the generated Prisma
#                  Client lives inside node_modules and is NOT carried over
#                  between separate `pnpm install` runs), after copying in
#                  packages/database/prisma/ (schema + migrations + seed.ts
#                  — needed both for `prisma generate` here AND, later, for
#                  the runner image to actually run migrate/seed)
#   4. runner    — copies the prod-deps tree (node_modules + the already-
#                  present packages/database/prisma/) wholesale, then
#                  overlays the actual built dist/ output on top; non-root,
#                  minimal beyond that
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY . .
RUN corepack use pnpm@9.15.9 && pnpm dlx turbo@2.10.10 prune @verevia/api --docker

FROM base AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=pruner /app/out/json/ .
RUN corepack use pnpm@9.15.9 && pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# prisma generate needs DATABASE_URL to be a syntactically valid connection
# string (schema validation only — it never connects), NOT a real
# database. The actual runtime DATABASE_URL is injected via docker-compose
# environment/env_file at container start, entirely separate from this
# build-time placeholder.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}
RUN corepack use pnpm@9.15.9 && pnpm exec turbo run build --filter=@verevia/api...

FROM base AS prod-deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=pruner /app/out/json/ .
RUN corepack use pnpm@9.15.9 && pnpm install --frozen-lockfile --prod
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}
COPY --from=pruner /app/out/full/packages/database/prisma ./packages/database/prisma
RUN corepack use pnpm@9.15.9 && pnpm --filter @verevia/database exec prisma generate

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 verevia && adduser --system --uid 1001 verevia
# Copy the whole prod-deps tree first — pnpm's strict, non-hoisted linking
# gives every workspace package its OWN node_modules full of symlinks into
# the root .pnpm store (not just the root node_modules), so copying only
# the root would leave e.g. `require("@nestjs/common")` unresolvable from
# apps/api/dist/main.js. Copying the whole tree sidesteps having to
# enumerate every pruned package's node_modules by hand. Then overlay the
# actual build output (which prod-deps never produced) on top, at the
# same paths, so the workspace symlinks resolve to real code.
COPY --from=prod-deps --chown=verevia:verevia /app ./
COPY --from=builder --chown=verevia:verevia /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=verevia:verevia /app/packages/auth/dist ./packages/auth/dist
COPY --from=builder --chown=verevia:verevia /app/apps/api/dist ./apps/api/dist
# prisma/seed.ts imports its sibling module via a relative source path
# (`../src/index`, not the compiled dist/ output or the package name) —
# correct for how it's normally run (tsx, from within a real checkout),
# but that means the raw TS source must exist here too for the seed step
# of `docker compose run migrate` to work from this image.
COPY --from=builder --chown=verevia:verevia /app/packages/database/src ./packages/database/src
USER verevia
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
