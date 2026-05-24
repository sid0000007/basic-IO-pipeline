# syntax=docker/dockerfile:1.7
#
# One image, two entrypoints: `node dist/main.js` for api, `node dist/worker.js`
# for the worker. Compose picks the command per service.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- build ----------------------------------------------------------------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @olives/types build \
 && pnpm --filter @olives/api exec prisma generate \
 && pnpm --filter @olives/api build

# ---- runtime --------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
