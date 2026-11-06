# Debian-slim, not Alpine: the local embedding runtime (onnxruntime) needs glibc. See docs/ASSUMPTIONS.md.
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
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
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist
WORKDIR /app/apps/api
ENV WEB_DIST_DIR=../web/dist
EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
