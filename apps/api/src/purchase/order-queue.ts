import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { waitForRedisReady } from '../redis/redis-client';
import { REDIS } from '../redis/redis.module';

// The contract with the worker. apps/worker/src/orders.queue.ts keeps a copy, and a test there
// fails if the two drift apart.
export const ORDERS_QUEUE = 'orders';
export interface OrderJob {
  userId: string;
}

/**
 * Rule 5: one job per user. BullMQ ignores an add whose jobId already exists, so a retried or
 * repeated enqueue does nothing. The userId is not used as it is because BullMQ rejects ids that
 * are all digits or contain ':'. The prefix and the encoding fix both, and two different userIds
 * can never map to the same id.
 */
export const orderJobId = (userId: string) => `order-${encodeURIComponent(userId)}`;

export const ORDER_JOB_OPTIONS = {
  // Five tries with exponential backoff: waits of 2, 4, 8 and 16 s between them, so the worker
  // rides out about 30 s of Postgres trouble before giving up.
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  // Completed jobs stay a day, so a repeat enqueue in that time finds the job and adds nothing.
  removeOnComplete: { age: 24 * 3600 },
  // Failed jobs are never deleted: the failed set is our dead-letter list, kept for inspection.
  removeOnFail: false,
} satisfies JobsOptions;

/**
 * The API's side of the orders queue (a BullMQ queue stored in Redis). The worker takes jobs off it
 * and writes them to Postgres, so no buyer ever waits on the database.
 */
@Injectable()
export class OrderQueue implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OrderQueue.name);
  readonly queue: Queue<OrderJob>;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    // The same fail-fast client as the gate (rule 4): no offline buffering, 500 ms timeout. So an
    // enqueue during a Redis outage fails quickly and the caller can compensate, instead of hanging.
    //
    // Not skipWaitingForReady: BullMQ runs a one-time setup check on a new queue. With that option
    // the check runs at once, fails if Redis is still connecting, and the queue stays broken for
    // good. Without it, setup waits for Redis, and onModuleInit below makes startup wait too.
    this.queue = new Queue<OrderJob>(ORDERS_QUEUE, { connection: redis });
    // Connection errors surface as "error" events. Without a listener Node treats them as
    // unhandled. A failed add still rejects on its own, so logging here is enough.
    this.queue.on('error', (err) => this.logger.warn(`Queue connection error: ${err.message}`));
  }

  // Startup waits (up to 10 s) until the queue is set up, so the first buyer never finds it broken.
  async onModuleInit() {
    await waitForRedisReady(this.redis);
    await this.queue.waitUntilReady();
  }

  async enqueue(userId: string): Promise<void> {
    await this.queue.add('order', { userId }, { ...ORDER_JOB_OPTIONS, jobId: orderJobId(userId) });
  }

  // The Redis client is shared, so this closes only the queue. RedisModule quits the client.
  async close() {
    await this.queue.close();
  }

  /**
   * Closed at the very end of shutdown, not in onModuleDestroy. Nest runs onModuleDestroy before
   * it stops the HTTP server, so a purchase still in flight would reserve a unit, find the queue
   * closed, release the unit and answer 503. onApplicationShutdown runs after the server has
   * stopped taking requests and finished the ones it had, so stopping one API replica (07) does
   * not fail anyone's purchase.
   */
  async onApplicationShutdown() {
    await this.close();
  }
}
