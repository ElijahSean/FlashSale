# Project setup and local infrastructure

## Problem and goal

There is no repo yet. We need a monorepo skeleton, Redis and Postgres running locally in Docker, and a NestJS API on Fastify that boots and answers a health check. Everything later builds on this.

## Scope

**In scope**

- npm workspaces monorepo: `apps/api`, `apps/worker`, `apps/web`, `stress/`
- `docker-compose.yml` with `redis` (AOF on) and `postgres`, on an internal network, with named volumes
- NestJS app using `FastifyAdapter`, config via `@nestjs/config` and `.env`
- `RedisModule` providing one shared ioredis client
- Prisma set up with an `Order` model and first migration
- `GET /health` reporting API, Redis and Postgres status
- `.env.example`, `.gitignore`, root scripts (`dev`, `test`, `lint`)
- ESLint + Prettier

**Out of scope**

- Any sale, purchase, auth or queue logic
- API replicas, nginx, worker and web containers (added in later requirements)
- CI pipeline

## Acceptance criteria

- [ ] `docker compose up -d redis postgres` starts both; `docker compose ps` shows them healthy
- [ ] Redis runs with `appendonly yes`
- [ ] Redis and Postgres ports are not published to the host except in a dev override file
- [ ] `npm run dev -w apps/api` starts the API on Fastify (log shows the Fastify adapter)
- [ ] `GET /health` returns 200 `{ api: "ok", redis: "ok", postgres: "ok" }` when both are up
- [ ] With Redis stopped, `GET /health` returns 503 and names Redis as down
- [ ] `npx prisma migrate dev` creates the `Order` table with `UNIQUE(userId)`
- [ ] `.env` is gitignored; `.env.example` lists every variable with placeholder values
- [ ] `npm run lint` passes

## Context and constraints

- Design rules: 7 (stateless), 11 (no secrets)
- `Order` model: `id`, `userId` (unique), `createdAt`
- Elijah is on Windows with Docker Desktop

## Test expectations

- Unit test for the health service (Redis and Postgres mocked up and down)
- Manual: stop the Redis container and hit `/health`

## Notes for planning

- Decide: dev override file (`docker-compose.override.yml`) to publish ports locally vs. running Node apps inside Docker during development. Default: publish ports in the override only.
