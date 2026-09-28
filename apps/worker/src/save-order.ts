import Redis from 'ioredis';
import { BUYERS_KEY, OrderJob } from './orders.queue';
import { OrderWriter } from './prisma';

export type SaveResult = 'saved' | 'duplicate' | 'not_a_buyer';

/**
 * Handles one job: turns one reserved unit into one row in Postgres.
 *
 * Rule 5, safe to repeat: a job can run twice (retry after a crash).
 * ON CONFLICT ("userId") DO NOTHING makes the second insert do nothing instead of failing.
 * It relies on the UNIQUE userId column (rule 2). Running twice = running once.
 *
 * Rule 3, Redis decides: first check the user still holds a unit in sale:buyers.
 * If the API gave the unit back, don't create an order for it.
 *
 * Any error (Postgres or Redis down) fails this try, and BullMQ retries later.
 */
export function createSaveOrder(deps: { db: OrderWriter; redis: Redis }) {
  return async ({ userId }: OrderJob): Promise<SaveResult> => {
    if ((await deps.redis.sismember(BUYERS_KEY, userId)) === 0) return 'not_a_buyer';

    // Prisma sends userId as a parameter, never pasted into the SQL (no SQL injection).
    // Postgres fills in id and createdAt.
    const inserted = await deps.db.$executeRaw`
      INSERT INTO orders ("userId") VALUES (${userId})
      ON CONFLICT ("userId") DO NOTHING`;
    return inserted === 1 ? 'saved' : 'duplicate';
  };
}
