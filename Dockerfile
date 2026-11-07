# Debian-slim, not Alpine: the local embedding runtime (onnxruntime) needs glibc. See docs/ASSUMPTIONS.md.
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .husky/install.mjs .husky/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @cv/web build

FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @cv/api...
# Bake the model weights in (its own layer, so code changes don't re-download), then forbid
# downloads at runtime: first boot embeds the seed with no network.
ARG EMBEDDING_MODEL=Xenova/bge-small-en-v1.5
ENV EMBEDDING_MODEL=$EMBEDDING_MODEL EMBEDDING_CACHE_DIR=/app/models
COPY apps/api/src/config.ts apps/api/src/
COPY apps/api/src/embed/bge-embedder.ts apps/api/src/embed/embedder.ts apps/api/src/embed/
COPY apps/api/src/cli/fetch-model.ts apps/api/src/cli/
RUN cd apps/api && ./node_modules/.bin/tsx src/cli/fetch-model.ts
ENV EMBEDDING_ALLOW_REMOTE=false
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY seed seed
COPY --from=build /app/apps/web/dist apps/web/dist
WORKDIR /app/apps/api
ENV WEB_DIST_DIR=../web/dist
EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
