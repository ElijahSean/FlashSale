# Order queue and worker

## Problem and goal

Winners must be saved permanently without putting Postgres on the hot path. After a successful reservation, the API enqueues an order; a separate worker writes it to Postgres with retries.

## Scope

**In scope**

- BullMQ `orders` queue shared by API and worker
- API: enqueue after `SUCCESS` with `jobId = userId`; on enqueue failure, run `release.lua` and return 503
- `apps/worker`: consumer inserting via Prisma with `ON CONFLICT DO NOTHING` (or `createMany` with `skipDuplicates`)
- Retries: 5 attempts, exponential backoff; failed jobs kept for inspection (dead-letter)
- Worker graceful shutdown (finish current job)

**Out of scope**

- Payment or order expiry
- Admin UI for failed jobs
- Separate broker (RabbitMQ/SQS)

## Acceptance criteria

- [ ] A successful purchase results in exactly one `Order` row within 2 s under normal conditions
- [ ] Enqueuing the same `userId` twice creates one job
- [ ] Processing the same job twice creates one row
- [ ] With Postgres stopped, jobs retry with backoff and are saved once Postgres returns
- [ ] After 5 failures a job stays in the failed set with the error recorded
- [ ] If enqueueing fails, stock and `sale:buyers` are restored and the API returns 503
- [ ] Reconciliation holds after the queue drains: `initialStock − sale:stock = SCARD sale:buyers = COUNT(orders)`

## Context and constraints

- Design rules: 5, 6
- Files: `apps/api/src/purchase/*`, `apps/worker/src/*`, `prisma/schema.prisma`

## Test expectations

- Integration (Testcontainers Redis + Postgres): enqueue, process, duplicate job, duplicate insert
- Integration: simulate enqueue failure and verify compensation
- Manual: stop Postgres, make purchases, start Postgres, confirm rows appear

## Notes for planning

- Decide whether API and worker share a small `packages/shared` for queue name, job type and Prisma client.
