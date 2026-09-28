import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { ORDERS_QUEUE, OrderJob } from './orders.queue';
import { OrderWriter } from './prisma';
import { createSaveOrder, SaveResult } from './save-order';

export interface OrderWorkerOptions {
  /** BullMQ's connection. Needs maxRetriesPerRequest: null (BullMQ requires it). */
  connection: Redis;
  db: OrderWriter;
  /** For the sale:buyers check. Can be the same client. */
  redis: Redis;
  /** Jobs at the same time. Each is one small insert; 10 keeps Postgres busy but calm. */
  concurrency?: number;
}

/**
 * Starts taking jobs from the orders queue. Retry settings come from the API when it adds
 * the job (order-queue.ts), not from here.
 */
export function startOrderWorker({ connection, db, redis, concurrency = 10 }: OrderWorkerOptions) {
  const save = createSaveOrder({ db, redis });
  return new Worker<OrderJob, SaveResult>(ORDERS_QUEUE, (job) => save(job.data), {
    connection,
    concurrency,
  });
}
