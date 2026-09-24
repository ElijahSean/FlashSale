import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { ORDERS_QUEUE, OrderJob } from './orders.queue';
import { OrderWriter } from './prisma';
import { createSaveOrder, SaveResult } from './save-order';

export interface OrderWorkerOptions {
  /** BullMQ's connection. Must have maxRetriesPerRequest: null (BullMQ requires it for workers). */
  connection: Redis;
  db: OrderWriter;
  /** For the sale:buyers check. Can be the same client as `connection`. */
  redis: Redis;
  /** Jobs processed at the same time. Each is one small insert, so 10 keeps Postgres busy but calm. */
  concurrency?: number;
}

/**
 * Starts consuming the orders queue. Retries, backoff and the failed set come from the job options
 * the API sets when it enqueues (apps/api/src/purchase/order-queue.ts), not from here.
 */
export function startOrderWorker({ connection, db, redis, concurrency = 10 }: OrderWorkerOptions) {
  const save = createSaveOrder({ db, redis });
  return new Worker<OrderJob, SaveResult>(ORDERS_QUEUE, (job) => save(job.data), {
    connection,
    concurrency,
  });
}
