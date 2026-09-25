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

## 2026-09-25 · 04 Order queue and worker
- Approach that worked: test-first (API 10 tests, worker 9, all against real Redis and Postgres). API `purchase()` = gate, then enqueue with `jobId = order-<encoded userId>`; enqueue failure after SUCCESS runs `release.lua` and returns 503; ALREADY_PURCHASED re-enqueues (repairs the 03 timeout edge). Worker checks `sale:buyers` before `INSERT ... ON CONFLICT DO NOTHING`. One Prisma schema with two generators. Queue name copied into the worker with a contract test instead of a shared package.
- Surprises / root causes: BullMQ rejects custom job ids that are all digits or contain `:`, so raw userIds break; prefix and encode. `skipWaitingForReady` on a queue built before Redis connects makes BullMQ's one-time setup fail and the queue stays broken for good (every purchase would be released); a startup test now catches it. Prisma 7 loads its engine with a dynamic `import()`, which Jest only allows with `--experimental-vm-modules`. Regenerating Prisma switched its imports to `.js`, which ts-jest cannot resolve; pinned `importFileExtension = ""`. The worker's `failed` event fires on every try, not just the last. Prisma hides the real cause on the last line of its error message.
- Watch-outs for next time: a small gap remains: if an enqueue times out but was written, and the worker takes the job before the release runs, one order can exist for a released unit (07 reconciliation should check). 05 maps `purchase()` results to HTTP codes; call `purchase()`, never `attempt()`. The Docker images in 07 must run `prisma generate` before building the worker.

## 2026-09-25 · 05 Demo login, AuthGuard and purchase endpoints
- Approach that worked: test-first (47 new tests: DTO, guard, mapping units, plus 23 HTTP tests with real Redis and Postgres through `app.inject()`). Guard order `AuthGuard` then `RateLimitGuard`, so 401 and 429 both stop before the Lua script. Rate limit = INCR + `PEXPIRE NX` in one MULTI, fixed 1 s window. Result mapping is a `Record` over every result, so a new Lua result cannot compile without an HTTP answer. `/me` falls back to Redis (`reserved`) when Postgres is down.
- Surprises / root causes: `@nestjs/jwt` 12 is ESM-only like NestJS 12 (TS1479); pinned 11. CORS with a single origin string always sends that origin; a list sends the header only to a matching caller. A Jest "worker failed to exit" came from RedisModule shutdown: `quit()` on an already-closed client failed and the fallback `disconnect()` started ioredis's 2 s force-close timer; now shutdown skips a client whose status is `end`. Found with an `async_hooks` trace of live timers. With Redis down the rate limiter is the first Redis call, so it is the one that answers 503.
- Watch-outs for next time: behind nginx (07) every request has nginx's IP, so the per-IP limit needs Fastify `trustProxy` for that hop, and k6 from one IP needs higher `RATE_LIMIT_*` values. Demo login also fails with 503 while Redis is down (its rate limit fails closed). The 201 message says "successful", not "confirmed": 06 should show `reserved` vs `confirmed` from `/me`.

## 2026-09-25 · 06 Purchase frontend
- Approach that worked: fetch lives only in `api.ts`, which turns every HTTP answer into one named outcome; pure `clock.ts` for the server clock offset (midpoint of the request); two hooks (`useSale` polls every 2 s, `useOrderStatus` follows `/me`); outcome messages as a `Record` over every outcome, same pattern as the API. 59 Vitest + React Testing Library tests with a fake API behind `fetch`. Added `initialStock` to `GET /api/sale` for "42 of 100 left".
- Surprises / root causes: the first double-click test passed even with the guard removed: React redraws the disabled button between two user-event clicks. Only two clicks inside one `act()` (no redraw in between) prove the `useRef` guard; checked by removing the guard and seeing 2 requests. A fake `/me` that said "not purchased" after a 201 re-enabled Buy, which made a second click look like a bug; fakes must behave like the real API. The design's 503 copy ("Nothing was reserved") is not always true (LEARNINGS 03), so the page asks `/me` after a 503 or a network error. PowerShell 5.1 `Set-Content -Encoding utf8` adds a BOM.
- Watch-outs for next time: a `.env` created before 05 has no `WEB_ORIGIN`, and the API will not start without it. jsdom 30 warns on Node 25 (odd release); Node 24 is fine. 07: nginx must forward `/api` and serve the built `apps/web/dist`, so the page keeps same-origin URLs (`VITE_API_BASE_URL` empty). Requirement 07 text still says `/auth/demo-login`; the real path is `/api/auth/demo-login`.
