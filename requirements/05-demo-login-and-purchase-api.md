# Demo login, AuthGuard and purchase endpoints

## Problem and goal

Users need to sign in with a username or email and buy with a token, so the API trusts the token and not the request body. This requirement exposes the purchase gate over HTTP with validation, auth and rate limiting.

## Scope

**In scope**

- `POST /auth/demo-login` body `{ userId }`: validate (DTO), normalize (trim, lowercase, 1 to 254 chars), return a JWT (`sub = userId`, ~30 min expiry)
- `AuthGuard`: verify `Authorization: Bearer <token>`, set `req.user.id`, else 401
- `POST /api/purchases` (guarded, no body): calls `PurchaseService`, maps results to HTTP codes
- `GET /api/purchases/me` (guarded): `confirmed` if in Postgres, else `reserved` if in `sale:buyers`, else `{ purchased: false }`
- Rate limits in Redis: per user and per IP, returning 429
- `@fastify/helmet`, CORS locked to `WEB_ORIGIN`, 1 KB body limit, global `ValidationPipe`

**Out of scope**

- Passwords, sign-up, refresh tokens, OAuth
- Admin endpoints
- Frontend

## Acceptance criteria

- [ ] `demo-login` with `" Eli@X.com "` returns a token whose `sub` is `eli@x.com`
- [ ] `demo-login` with empty, non-string or 255+ char `userId` returns 400
- [ ] Purchase without a token, with a tampered token, or with an expired token returns 401
- [ ] A userId in the purchase body is ignored; identity comes only from the token
- [ ] Result mapping: `SUCCESS` 201, `ALREADY_PURCHASED` 409, `SOLD_OUT` 410, `NOT_STARTED`/`ENDED` 403, Redis down 503
- [ ] `GET /api/purchases/me` returns `reserved`, then `confirmed` once the worker saves the order
- [ ] Exceeding the per-user or per-IP limit returns 429 without calling the Lua script
- [ ] Response headers include helmet defaults; a request from another origin is blocked by CORS
- [ ] A body over 1 KB returns 413
- [ ] Error responses never include stack traces
- [ ] `JWT_SECRET` comes from env; startup fails if it is missing

## Context and constraints

- Design rules: 4, 8, 10
- The guard is the seam for real auth later; keep all token logic inside it
- Files: `apps/api/src/auth/*`, `apps/api/src/purchase/purchase.controller.ts`, `apps/api/src/common/*`

## Test expectations

- Unit: DTO validation and normalization; result-to-HTTP mapping; guard with valid, missing, tampered, expired tokens
- Integration (Supertest + Testcontainers): full login then purchase flow, 401s, 429s, `/me` states

## Notes for planning

- Pick rate limit values (suggest 5 req/s per user, 50 req/s per IP) and make them env-configurable so k6 runs are not throttled unintentionally.
