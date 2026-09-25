# Flash Sale System (Bookipi take-home)

High-throughput flash sale: one product, limited stock, one unit per user. Graded on system design, code quality, correctness under load, testing, and pragmatism. Elijah must be able to explain and change every line in a live interview.

## How we work (dev loop)

The process lives in `DEVELOPMENT.md`: two gates (plan, then diff), plain-language gate messages,
clickable approvals, three attempts per issue, compact between requirements. In short:

1. **Requirement**: work `requirements/` in number order, one at a time. Acceptance criteria are the definition of done.
2. **Plan** (Gate 1): files to touch, order, risks, open questions, how each criterion is verified. No code before approval.
3. **Build together**: small steps. Comments explain *why* and name the design rule they satisfy, so the code can be presented.
4. **Test**: for 03, 04 and 05 (gate, queue, API), write the test first, see it fail, then write the code. Run the full suite and show the output.
5. **Review** (Gate 2): diff and test results in plain language. Wait for approval.
6. **Record**: one `LEARNINGS.md` entry, one local commit (`NN: <what changed>`), update `TASKS.md` and `.dev-loop/state.json`.

Before starting any requirement: read `docs/design-rules.md` and `LEARNINGS.md`.

Git: local commits only. Never push, add a remote or make the repo public; those are Elijah's steps at submission.

## Stack (decided, do not change without asking)

- API: NestJS on the Fastify adapter, TypeScript
- Gate: Redis + one Lua script (`apps/api/src/purchase/lua/purchase.lua`)
- Queue: BullMQ on Redis
- DB: PostgreSQL via Prisma
- Frontend: React + Vite + TypeScript + Tailwind
- Auth: demo login, JWT, NestJS `AuthGuard`
- Tests: Jest, Fastify `app.inject()` for HTTP (no open port), Testcontainers (API/worker); Vitest + React Testing Library (web); k6 (stress)
- Infra: Docker Compose (redis, postgres, api x2, worker, nginx, k6 on demand)

## Repo layout

```
apps/api/       NestJS: auth, sale, purchase, health modules
apps/worker/    BullMQ consumer, writes orders via Prisma
apps/web/       React + Vite + Tailwind
stress/         k6 scripts + verify script
docs/           architecture diagram, design rules, UI design (docs/design/), stress results
requirements/   one file per feature (+ _template.md)
.dev-loop/      state.json: hash of each requirement already scanned
.claude/        commands: /dev-loop and /requirement-builder
```

## Commands

Run from the repo root. Prerequisite: Docker Desktop running, `.env` copied from `.env.example`
with a real `JWT_SECRET` (32+ characters; the API refuses to start without it).

- `docker compose up -d redis postgres`: start the data stores (dev override publishes them on 127.0.0.1)
- `npm run dev`: API in watch mode on port 3000 (`GET /health`)
- `npm run dev:worker`: build and run the order worker (consumes the `orders` queue, writes to Postgres)
- `npm run dev:web`: the web app on http://localhost:5173 (Vite; forwards `/api` to the API on 3000)
- `docker compose up --build`: the whole system on http://localhost:8080 (nginx, api1 + api2, worker, migrate)
- `npm run stress:up`, then `npm run stress:stampede|greedy|window|failover` and `npm run verify`: k6 runs (see README)
- `npm test`: all workspace tests
- `npm run lint`: ESLint for the whole repo; `npm run format`: Prettier (code only)
- `npm run prisma:migrate -w apps/api -- --name <change>`: create and apply a migration
- `npm run prisma:generate -w apps/api`: regenerate the Prisma clients for the API and the worker (gitignored, under `src/generated`)
- `docker compose exec redis redis-cli DEL sale:config sale:stock sale:buyers`: reset the sale; the next API start reseeds it from `.env`
- Integration tests (`*.int.spec.ts`) start their own Redis and Postgres with Testcontainers, so Docker must be running for `npm test`
- API and worker tests run Jest with `--experimental-vm-modules`: Prisma 7 loads its query engine with a dynamic `import()`

Pinned on purpose: NestJS 11 and `@nestjs/jwt` 11 (12 is ESM-only), Prisma 7.10 (npm `latest` is an 8.x RC).
Git Bash note: `cd` into a subfolder can trip fnm's shell hook; use `-w <workspace>` from the root.

## Writing style for docs and comments

- Plain, short sentences. No em dashes.
- Comments explain intent and trade-offs, not what the syntax does.
