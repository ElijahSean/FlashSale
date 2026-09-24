# Full stack in Docker and stress tests

## Problem and goal

Reviewers must run everything with one command, and we must prove the concurrency rules hold under heavy load across multiple API replicas.

## Scope

**In scope**

- Dockerfiles for api, worker, web (multi-stage, non-root user)
- Compose: `api` with 2 replicas, `worker`, `nginx` (load balances `/api` and `/auth`, serves the web build), healthchecks
- `POST /api/admin/reset` only when `ENABLE_ADMIN=true`, protected by `ADMIN_TOKEN`: resets stock, buyers, orders, queue
- k6 scripts (run via `docker compose run k6`): stampede, greedy users, window edges
- `npm run verify`: reconciliation check printing PASS or FAIL
- Results summary saved to `docs/stress-results.md`
- README: quick start, run tests, run stress tests, expected outcome

**Out of scope**

- Cloud deployment
- CI pipeline
- Redis/Postgres high availability

## Acceptance criteria

- [ ] From a fresh clone: `cp .env.example .env && docker compose up --build` brings up the whole system; the web page loads at `http://localhost:8080`
- [ ] Two API containers receive traffic (visible in logs by container name)
- [ ] Stopping one API container does not interrupt purchases
- [ ] Admin reset is absent (404) unless `ENABLE_ADMIN=true`, and returns 401 without the token
- [ ] **Stampede:** 10,000 unique users, stock 100: exactly 100 × 201, the rest 410, zero 5xx
- [ ] **Greedy users:** 500 users × 20 parallel requests: each user has at most one 201
- [ ] **Window edges:** all attempts before start and after end get 403
- [ ] `npm run verify` prints PASS after each scenario (after the queue drains)
- [ ] p95 latency for the stampede is recorded in `docs/stress-results.md`
- [ ] README instructions work on a clean machine with only Docker and Node installed

## Context and constraints

- Design rules: all; this requirement proves them
- k6 users call `/auth/demo-login` first, then purchase with their token
- Rate limits must be set high enough (via env) for the stress profile, and the README must say so

## Test expectations

- The k6 thresholds are the tests: the run fails if counts are wrong
- All unit and integration tests from earlier requirements still pass

## Notes for planning

- Decide whether k6 gets tokens during setup (faster) or per iteration (more realistic). Default: in `setup()`.
