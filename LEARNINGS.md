# LEARNINGS.md

Read at the start of every scan and plan. Appended to at the end of every loop, success or not.
Keep entries short: this file doubles as interview material ("what surprised you?").

Entry format:

```
## <date> · <requirement ID and title>
- Approach that worked: <one line>
- Surprises / root causes: <bug, why, fix>
- Watch-outs for next time: <what to check first>
```

Never put real secrets or personal data in here. Use placeholders.

---

## 2026-09-24 · 01 Project setup and local infrastructure
- Approach that worked: hand-written NestJS files (no `nest new`), Compose with data stores private by default and an override that publishes them on 127.0.0.1 for dev.
- Surprises / root causes: NestJS 12 is ESM-only and broke Jest under CommonJS; pinned 11. npm `latest` for Prisma is an 8.x RC; pinned 7.10, which needs `prisma.config.ts`, the `pg` driver adapter, and loads no `.env` by itself. TypeScript 6 rejects `moduleResolution: node`; use `node16`. Prisma's `@default(uuid())` is client-side, so a raw `INSERT ... ON CONFLICT` would have no id; moved it to Postgres `gen_random_uuid()`.
- Watch-outs for next time: ioredis buffers commands while disconnected unless `enableOfflineQueue: false`, which would silently break fail closed (rule 4). The worker in 04 must generate its Prisma client from `apps/api/prisma/schema.prisma`, not a copy.

## 2026-09-25 · 02 Sale and product config, status endpoint
- Approach that worked: pure `parseSaleConfig` and `computeStatus` for unit tests; seeding with one MULTI of HSETNX + `SET NX` so restarts and parallel replicas never reset stock; 1 s snapshot cache with single-flight (share the pending promise) so a burst makes one Redis read.
- Surprises / root causes: a Jest run "hung" after passing because a startup that fails in a provider leaves the already-created ioredis client reconnecting forever; the test stubs Redis for that case. ts-jest with isolatedModules missed TS1272 (interface in a decorated constructor needs `import type`); only `nest build` caught it, and its partial output still ran and seeded Redis.
- Watch-outs for next time: run `tsc --noEmit` or `nest build`, not just Jest, before Gate 2. The Lua gate (03) must use the same half-open window `[startsAt, endsAt)` as `computeStatus`, with Redis `TIME`.

## 2026-09-25 · 03 Atomic purchase gate (Lua script)
- Approach that worked: test-first against real Redis (17 red, then green); `purchase.lua` checks window (Redis `TIME`), buyer, stock, then `DECR` + `SADD`; `release.lua` does `SREM` first and `INCR` only if it removed someone, so it is idempotent. Hand-written `SCRIPT LOAD` + `EVALSHA`, one retry on `NOSCRIPT` only. Ten clients stand in for ten replicas in the concurrency tests.
- Surprises / root causes: a timed-out call is not a cancelled call. The API returned 503 after 500 ms, but Redis still ran the script afterwards and reserved the unit; the test now asserts this. Redis 7 disables `DEBUG` unless started with `--enable-debug-command yes` (test container only). `nest build` does not copy `.lua` files; needs an `assets` entry in `nest-cli.json`.
- Watch-outs for next time: 04/05 must handle the timeout edge (a user can hold a unit with no order). Plan: on `ALREADY_PURCHASED`, enqueue again with `jobId = userId`, which BullMQ ignores if the job exists (rule 5).
