import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { waitForRedisReady } from '../redis/redis-client';
import { REDIS } from '../redis/redis.module';

// Shared with the worker. apps/worker/src/orders.queue.ts has a copy; a test fails if they differ.
export const ORDERS_QUEUE = 'orders';
export interface OrderJob {
  userId: string;
}

/**
 * Rule 5: one job per user. If a job with this id exists, BullMQ ignores the new one.
 * So queueing twice does nothing.
 * Why not the plain userId: BullMQ rejects ids that are all digits or contain ':'.
 * The "order-" prefix and the encoding fix both.
 */
export const orderJobId = (userId: string) => `order-${encodeURIComponent(userId)}`;

export const ORDER_JOB_OPTIONS = {
  // Five tries, waiting 2, 4, 8, then 16 s. The worker survives about 30 s of Postgres trouble.
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  // Keep finished jobs a day, so a repeat in that time is still ignored.
  removeOnComplete: { age: 24 * 3600 },
  // Never delete failed jobs. They are our list of orders to look into.
  removeOnFail: false,
} satisfies JobsOptions;

/**
 * The API side of the orders queue (BullMQ, stored in Redis).
 * The worker saves the jobs to Postgres, so buyers never wait on the database.
 */
@Injectable()
export class OrderQueue implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OrderQueue.name);
  readonly queue: Queue<OrderJob>;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    // Same fail-fast Redis client as the gate (rule 4). If Redis is down, queueing fails fast
    // and the caller can give the unit back, instead of hanging.
    //
    // No skipWaitingForReady: with it, BullMQ's setup can run before Redis is connected,
    // fail, and leave the queue broken for good.
    this.queue = new Queue<OrderJob>(ORDERS_QUEUE, { connection: redis });
    // Without a listener, an "error" event crashes Node. A failed add still throws, so logging is enough.
    this.queue.on('error', (err) => this.logger.warn(`Queue connection error: ${err.message}`));
  }

  // Startup waits (up to 10 s) for the queue, so the first buyer never finds it broken.
  async onModuleInit() {
    await waitForRedisReady(this.redis);
    await this.queue.waitUntilReady();
  }

  async enqueue(userId: string): Promise<void> {
    await this.queue.add('order', { userId }, { ...ORDER_JOB_OPTIONS, jobId: orderJobId(userId) });
  }

  // Closes only the queue. The shared Redis client is closed by RedisModule.
  async close() {
    await this.queue.close();
  }

  /**
   * Closed at the very end of shutdown. Nest runs onModuleDestroy before it stops the HTTP server,
   * so a purchase still running would find the queue closed and get 503.
   * onApplicationShutdown runs after the server has finished its last request.
   */
  async onApplicationShutdown() {
    await this.close();
  }
}
