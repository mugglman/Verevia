# Multi-stage build for @verevia/web (Next.js), per docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md.
#
# Build context is the REPO ROOT — build from there:
#
#   docker build -f infrastructure/docker/web.Dockerfile -t verevia-dev-web .
#
# Deliberately does NOT use Next.js `output: "standalone"`: standalone's
# automatic dependency tracing has a well-known gap with Prisma's generated
# native query-engine binary (apps/web/src/lib/tenant.ts uses @verevia/database
# directly server-side), and chasing that tracing edge case is not worth it
# for a DEV deployment — a real, separately-installed production
# node_modules (same pattern as api.Dockerfile) is simpler and more
# robust, at the cost of a somewhat larger image than a fully-traced
# standalone build would give.
#
# Same four-stage shape as api.Dockerfile (see the comments there for the
# full rationale): pruner -> builder (full install + `next build`) ->
# prod-deps (production-only install + prisma generate for THIS stage's
# node_modules) -> runner (non-root, only the built output + prod deps).

FROM node:22-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY . .
RUN corepack use pnpm@9.15.9 && pnpm dlx turbo@2.10.10 prune @verevia/web --docker

FROM base AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=pruner /app/out/json/ .
RUN corepack use pnpm@9.15.9 && pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Build-time-only placeholder for @verevia/database's own build step
# (prisma generate needs DATABASE_URL to be syntactically present, see
# api.Dockerfile) — the real runtime value comes from docker-compose.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}
# NEXT_PUBLIC_* variables are inlined into the CLIENT bundle by `next
# build` itself — unlike every other env var here, this one is NOT
# read at container-start time, so it MUST be supplied as a build arg,
# not just a docker-compose `environment:` entry (see
# apps/web/src/lib/auth-client.ts / invitation-accept-form.tsx).
ARG NEXT_PUBLIC_API_URL="http://localhost:3001"
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN corepack use pnpm@9.15.9 && pnpm exec turbo run build --filter=@verevia/web...

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
# Copy the whole prod-deps tree first (see api.Dockerfile's runner stage
# for the full rationale — pnpm gives every workspace package its own
# node_modules, not just the root), then overlay the actual build output
# on top at the same paths.
COPY --from=prod-deps --chown=verevia:verevia /app ./
COPY --from=builder --chown=verevia:verevia /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=verevia:verevia /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=verevia:verevia /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=verevia:verevia /app/apps/web/next.config.ts ./apps/web/next.config.ts
USER verevia
ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
