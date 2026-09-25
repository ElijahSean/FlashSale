# Stress test results

Requirement 07. Every run goes through the whole stack: k6 calls nginx, nginx spreads requests
over two API replicas, the replicas share one Redis (the gate and the queue), and one worker saves
orders to Postgres. Each k6 user logs in first (`POST /api/auth/demo-login`), then buys with its token.

The k6 thresholds are the tests: a wrong count fails the run (exit code 99). After each run,
`npm run verify` checks that Redis and Postgres agree (see [How verify works](#how-verify-works)).

## Machine

One desktop, everything in Docker Desktop: AMD Ryzen 5 5600X (6 cores, 12 threads), 16 GB for
Docker, Windows 10 with the WSL2 backend, Docker 29.4.2, k6 2.3.0. k6 runs on the same machine as
the system it tests, so the numbers show correctness and relative speed, not cloud capacity.

## Results (2026-09-25)

| Scenario | Load | Expected | Got | verify |
| --- | --- | --- | --- | --- |
| Stampede | 10,000 users, 1 buy each, stock 100 | exactly 100 × 201, rest 410, no 5xx | 100 × 201, 9,900 × 410, 0 × 5xx | PASS |
| Greedy users | 500 users × 20 parallel buys, stock 100 | nobody gets two 201s | 100 × 201 (100 users), 1,900 × 409, 8,000 × 410, 0 × 5xx | PASS |
| Window edges | 1,000 users before the start, 1,000 after the end | all 403, stock untouched | 1,000 × `NOT_STARTED`, 1,000 × `ENDED`, 0 × 201 | PASS (0 buyers) |
| Failover | 50 new users/s for 30 s, one API replica stopped at 12 s | no failed purchase | 1,500 × 201, 0 × 5xx; 1 of 1,500 logins failed | PASS |

### Latency of the buy request (login excluded)

| Scenario | Median | p95 | p99 | Max | Throughput |
| --- | --- | --- | --- | --- | --- |
| Stampede | 26 ms | **103 ms** | 3.56 s | 4.35 s | 10,000 users in 5.0 s (4,038 requests/s) |
| Greedy users | 506 ms | 2.36 s | 2.74 s | 2.91 s | 10,000 buys in 3.1 s |
| Window edges | 23 ms | 46 ms | | 67 ms | light load |
| Failover | 1.1 ms | 1.8 ms | 3.0 s | 3.0 s | 50 users/s |

## What the numbers say

- **No oversell, one per user, no lost stock.** In every run, stock left + buyers = initial stock,
  and every Redis buyer has exactly one Postgres order. Stock only changes in the Lua script
  (rule 1), and both guards agree (rule 2).
- **The slow tail is connection setup, not the gate.** The median stampede buy takes 26 ms and
  the p95 103 ms, but the p99 is 3.6 s. nginx opens a new connection to the API for every request
  (no keep-alive, see below). When thousands arrive in the same instant, some connection attempts
  are dropped and the kernel retries them after 1 s, sometimes twice. The API's listen queue was
  raised from 511 to 4,096 for this (`apps/api/src/main.ts`); the greedy test, with 10,000
  requests fired inside one second, still shows it.
- **Failover.** Stopping a replica cost no purchase. Requests that met the stopped replica waited
  for the 3 s connect timeout, then nginx sent them to the other one (the 3 s p99). After 3 such
  failures nginx skips that replica for 10 s before trying it again, so only a few requests pay
  the delay (p95 stayed at 1.8 ms).

## Known limits

- **One login failed during failover** (1 of 1,500, both times we ran it). It reached the replica
  in the instant it was shutting down. Node closes connections that have not sent a full request
  yet, and nginx does not resend a POST that was already sent, so it answered 502. A purchase can
  hit the same race. The user sees "try again", and nothing is lost: verify passes. A short delay
  between "stop accepting" and "close connections" at shutdown would close this gap.
- **No keep-alive between nginx and the API.** With keep-alive the connection storm, and with it
  the p99 tail, would mostly disappear. It was left off on purpose: with reused connections, a
  replica that shuts down can close a connection nginx just sent a purchase on. For a production
  deployment the next step is keep-alive plus that shutdown delay.
- **One machine.** k6, nginx, both replicas, Redis, Postgres and the worker share 6 cores.

## How to reproduce

```bash
npm install                  # once, for npm run verify
npm run stress:up            # full stack with admin reset on and high rate limits
npm run stress:stampede      # then: npm run verify
npm run stress:greedy        # then: npm run verify
npm run stress:window        # then: npm run verify
npm run stress:failover      # about 10 s in, in a second terminal: docker compose stop api1
npm run verify               # then: docker compose start api1
```

Each script resets the sale itself (`POST /api/admin/reset`), so they can run in any order.

## How verify works

`npm run verify` (`stress/verify.ts`) reads Redis and Postgres directly, waits up to 60 s for the
worker to empty the queue, then checks:

1. the queue is drained, and no job is in the failed set
2. stock is not negative
3. stock left + buyers = initial stock (nothing oversold, nothing lost)
4. every Redis buyer has an order in Postgres
5. every Postgres order has a Redis buyer (no order for a unit that was given back)

It prints PASS or FAIL and exits with 1 on FAIL.
