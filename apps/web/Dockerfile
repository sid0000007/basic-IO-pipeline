# syntax=docker/dockerfile:1.7
#
# Next.js 16 standalone-output build. The runtime stage ships only the files
# Next determined are needed (server.js + traced deps), not the full workspace.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- build ----------------------------------------------------------------
FROM base AS build
  COPY . .
  # See apps/api/Dockerfile for the rationale — same cache-id constraint.
  RUN pnpm install --frozen-lockfile
  RUN pnpm --filter @olives/types build
# NEXT_PUBLIC_* env vars get inlined at build time. Compose passes them as
# build args; the override defaults to localhost for ad-hoc local builds.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm --filter @olives/web build

# ---- runtime --------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
