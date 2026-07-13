# Build stage: compile server (tsc) and web (vite), then isolate the server's
# production dependencies with `pnpm deploy`.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY server server
COPY web web
RUN pnpm --filter @pricing-app/server build && pnpm --filter @pricing-app/web build
RUN pnpm --filter @pricing-app/server --prod deploy /out

# Runtime: node + rclone (backups to Google Drive). SQLite lives on the mounted
# volume at /data (see fly.toml); the app's own auth is the only access gate.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends rclone ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out /app/server
COPY --from=build /app/web/dist /app/web/dist
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/app.db \
    WEB_DIST=/app/web/dist
EXPOSE 3001
CMD ["node", "/app/server/dist/index.js"]
