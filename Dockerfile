# One Dockerfile, four images. Compose picks one with "target":
#   api      the API                  (api1, api2)
#   worker   the order worker         (worker)
#   migrate  creates the tables once  (migrate)
#   web      nginx + the web page     (nginx)
# Everything is built once in "build". Each final image only has what it needs to run.

# ---------- build: every workspace, all dependencies ----------
FROM node:24-alpine AS build
WORKDIR /app

# package.json files first: Docker caches this step, so `npm ci` only reruns when
# dependencies change, not on every code edit.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY stress/package.json stress/
RUN npm ci

COPY tsconfig.base.json ./
COPY apps apps
# Prisma needs a DATABASE_URL but doesn't connect here, so a fake one is fine.
# This makes the database clients for both the API and the worker.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate -w apps/api \
 && npm run build -w apps/api \
 && npm run build -w apps/worker \
 && npm run build -w apps/web

# ---------- production dependencies only, per app ----------
# `--omit=dev`: no TypeScript, Jest or Prisma CLI in the running images.
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY stress/package.json stress/

FROM prod-deps AS api-deps
RUN npm ci --omit=dev -w apps/api && npm cache clean --force

FROM prod-deps AS worker-deps
RUN npm ci --omit=dev -w apps/worker && npm cache clean --force

# ---------- api ----------
FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
# Copy all installed packages.
COPY --from=api-deps /app ./
COPY --from=build /app/apps/api/dist apps/api/dist
# Run as the "node" user, not root. An attacker who gets in isn't root.
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]

# ---------- worker ----------
FROM node:24-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=worker-deps /app ./
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER node
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]

# ---------- migrate ----------
# Runs `prisma migrate deploy` once and exits. It needs the Prisma CLI (a dev tool),
# so it starts from the build stage.
FROM build AS migrate
USER node
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- web ----------
# nginx as a normal user, on port 8080 (ports below 1024 need root).
FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
