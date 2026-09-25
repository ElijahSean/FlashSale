# One Dockerfile, four images (requirement 07). Each final stage is picked with a build target:
#   api      NestJS API              (docker compose: api, 2 replicas)
#   worker   BullMQ order worker     (docker compose: worker)
#   migrate  one-shot schema update  (docker compose: migrate)
#   web      nginx + the React build (docker compose: nginx)
# The shared build stage installs and compiles once. Final stages carry only what runs.

# ---------- build: every workspace, all dependencies ----------
FROM node:24-alpine AS build
WORKDIR /app

# Manifests first: Docker caches this layer, so `npm ci` reruns only when dependencies change,
# not on every code edit. npm needs every workspace's package.json to match the lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY stress/package.json stress/
RUN npm ci

COPY tsconfig.base.json ./
COPY apps apps
# prisma.config.ts reads DATABASE_URL, but generate never connects: a placeholder is enough.
# One generate writes the clients for both the API and the worker (same schema, see 04).
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run prisma:generate -w apps/api \
 && npm run build -w apps/api \
 && npm run build -w apps/worker \
 && npm run build -w apps/web

# ---------- production dependencies only, per app ----------
# Same manifests, `--omit=dev`: no TypeScript, Jest or Prisma CLI in the running images.
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
# The whole stage: root node_modules plus any package npm kept inside the workspace folder.
COPY --from=api-deps /app ./
COPY --from=build /app/apps/api/dist apps/api/dist
# The node image ships an unprivileged "node" user. A break-in to the process is not root.
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
# Runs `prisma migrate deploy` once and exits: applies committed migrations, never creates new
# ones. It needs the Prisma CLI, a dev dependency, so it starts from the build stage.
FROM build AS migrate
USER node
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- web ----------
# nginx-unprivileged runs as a normal user and listens on 8080 (ports below 1024 need root).
FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
