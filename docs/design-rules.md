# Design rules

Rules every requirement and every change must respect. If a change would break one, stop and ask.

1. **Never oversell.** Stock only changes inside the Lua script. No code outside it may read-then-write stock.
2. **One unit per user, enforced twice.** Redis `sale:buyers` set during the sale; Postgres `UNIQUE(userId)` permanently.
3. **The Redis gate decides.** Purchase outcomes come only from the Lua script result. Postgres never decides who wins.
4. **Fail closed.** If Redis is unreachable or times out, return 503. Never fall back to a non-atomic path.
5. **Idempotent everywhere a retry can happen.** BullMQ job id `order-<userId>` (one job per user; BullMQ rejects ids that are all digits or contain `:`); worker insert uses `ON CONFLICT DO NOTHING`.
6. **No lost stock.** If enqueueing fails after a successful reservation, run the compensating script (stock +1, remove buyer) before returning 503.
7. **Stateless API.** No sale state in process memory, except the short (~1 s) cache for `GET /api/sale`.
8. **Identity comes from the token.** Protected endpoints read `req.user.id` set by `AuthGuard`, never a userId from the body.
9. **One clock.** The Lua script uses Redis `TIME` for the sale window. Never compare against the API server's clock for purchase decisions.
10. **userId is normalized once.** Trimmed and lowercased at demo login; everything downstream uses the token's value.
11. **No secrets in the repo.** Only `.env.example` is committed.
12. **One product, from config.** Product details come from env and are seeded into `sale:config`. No product table or product endpoints.

## Redis keys

| Key | Type | Meaning |
| --- | --- | --- |
| `sale:config` | hash | `startsAt`, `endsAt` (epoch ms), `initialStock`, `productName`, `productPrice`, `productImageUrl` |
| `sale:stock` | string (int) | Units left |
| `sale:buyers` | set | userIds who secured a unit |
| `ratelimit:user:<id>` / `ratelimit:ip:<ip>` | string (int), TTL | Request counters |

## Purchase results

| Result | HTTP |
| --- | --- |
| `SUCCESS` | 201 |
| `ALREADY_PURCHASED` | 409 |
| `SOLD_OUT` | 410 |
| `NOT_STARTED` / `ENDED` | 403 |
| Missing/invalid token | 401 |
| Rate limited | 429 |
| Redis unavailable | 503 |
