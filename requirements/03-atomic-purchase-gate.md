# Atomic purchase gate (Lua script)

## Problem and goal

This is the heart of the test. Thousands of concurrent purchase attempts must never oversell and never give one user two units. A single Lua script in Redis checks the window, the user and the stock, then reserves, in one atomic step.

## Scope

**In scope**

- `purchase.lua`: sale window check (Redis `TIME`), duplicate check (`sale:buyers`), stock check, `DECR` + `SADD`
- `release.lua`: compensating script (stock +1, remove buyer), used when enqueueing fails
- Scripts loaded once at startup (`SCRIPT LOAD`) and called with `EVALSHA`, reloading on `NOSCRIPT`
- `PurchaseService.attempt(userId)` returning a typed result
- Short Redis command timeout; timeout or connection error maps to 503

**Out of scope**

- HTTP endpoint and auth (requirement 05)
- Queueing and Postgres writes (requirement 04)
- Rate limiting (requirement 05)

## Acceptance criteria

- [ ] Before `startsAt` returns `NOT_STARTED`; after `endsAt` returns `ENDED`, using Redis `TIME`
- [ ] A user already in `sale:buyers` gets `ALREADY_PURCHASED` and stock is unchanged
- [ ] Stock 0 returns `SOLD_OUT` and stock stays 0 (never negative)
- [ ] Success decrements stock by exactly 1 and adds the user to `sale:buyers`
- [ ] **Concurrency:** 1,000 parallel attempts by unique users on stock 10 produce exactly 10 `SUCCESS`, stock ends at 0, `SCARD sale:buyers` = 10
- [ ] **Concurrency:** 200 parallel attempts by the same user on stock 10 produce exactly 1 `SUCCESS`
- [ ] `release.lua` restores stock by 1 and removes the user; calling it for a user not in the set changes nothing
- [ ] If Redis is down or times out, `attempt` throws an error that maps to 503; no fallback path exists
- [ ] After `SCRIPT FLUSH`, the next call reloads the script and succeeds

## Context and constraints

- Design rules: 1, 2, 3, 4, 6, 9
- Key names and result codes: `docs/design-rules.md`
- Files: `apps/api/src/purchase/lua/*.lua`, `purchase.service.ts`, `redis.module.ts`

## Test expectations

- All criteria tested against real Redis via Testcontainers (no Redis mocks for the script)
- The two concurrency tests are the headline tests; name them clearly

## Notes for planning

- Every line of the Lua script needs a comment; Elijah will walk through it live.
- Plan should state how the release script is kept safe from double calls (idempotent `SREM` check before `INCR`).
