import Redis from 'ioredis';
import { BUYERS_KEY, OrderJob } from './orders.queue';
import { OrderWriter } from './prisma';

export type SaveResult = 'saved' | 'duplicate' | 'not_a_buyer';

/**
 * The job handler: turns one reserved unit into one row in Postgres.
 *
 * Rule 5, idempotent: a job can run more than once (a retry after a crash, a duplicate enqueue).
 * ON CONFLICT ("userId") DO NOTHING makes the second insert a no-op instead of an error, backed by
 * the UNIQUE constraint on userId (rule 2). So "run twice" has the same effect as "run once".
 *
 * Rule 3, Redis decides: before writing, check the user still holds a unit in sale:buyers. If an
 * enqueue timed out but was in fact written, the API released the unit, and this job must not
 * create an order for it. Postgres only records what Redis already decided.
 *
 * Any thrown error (Postgres or Redis down) fails this attempt, and BullMQ retries it with backoff.
 */
export function createSaveOrder(deps: { db: OrderWriter; redis: Redis }) {
  return async ({ userId }: OrderJob): Promise<SaveResult> => {
    if ((await deps.redis.sismember(BUYERS_KEY, userId)) === 0) return 'not_a_buyer';

    // Tagged template: Prisma sends userId as a query parameter, never pasted into the SQL.
    // The id and createdAt come from column defaults in Postgres.
    const inserted = await deps.db.$executeRaw`
      INSERT INTO orders ("userId") VALUES (${userId})
      ON CONFLICT ("userId") DO NOTHING`;
    return inserted === 1 ? 'saved' : 'duplicate';
  };
}
