import { ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { createRedisClient, waitForRedisReady } from '../redis/redis-client';
import { SALE_KEYS } from '../sale/sale.keys';
import { OrderQueue, ORDER_JOB_OPTIONS, orderJobId } from './order-queue';
import { PurchaseService } from './purchase.service';

// The API side of 04: purchase, then enqueue, with compensation when the enqueue fails.
// Real Redis (Testcontainers). The worker side is tested in apps/worker.
jest.setTimeout(120_000);

const HOUR = 3_600_000;

describe('purchase + order queue with real Redis', () => {
  let container: StartedTestContainer;
  let admin: Redis; // plain client for arranging and inspecting state
  let client: Redis; // production-configured client shared by the gate and the queue
  let orders: OrderQueue;
  let service: PurchaseService;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7.4-alpine').withExposedPorts(6379).start();
    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    admin = new Redis(url);
    client = createRedisClient(url);
    await waitForRedisReady(client);
    orders = new OrderQueue(client);
    await orders.onModuleInit();
    service = new PurchaseService(client, orders);
    await service.onModuleInit();
  });

  afterAll(async () => {
    await orders?.close();
    await client?.quit();
    await admin?.quit();
    await container?.stop();
  });

  /** Fresh sale that is open now, and an empty queue. */
  async function setSale(stock = 10) {
    const [s] = await admin.time();
    const now = Number(s) * 1000;
    await admin.flushall();
    await admin.hset(SALE_KEYS.config, {
      startsAt: String(now - HOUR),
      endsAt: String(now + HOUR),
      initialStock: String(stock),
    });
    await admin.set(SALE_KEYS.stock, stock);
  }

  const stock = async () => Number(await admin.get(SALE_KEYS.stock));
  const isBuyer = async (userId: string) => (await admin.sismember(SALE_KEYS.buyers, userId)) === 1;
  const jobCount = async () => {
    const counts = await orders.queue.getJobCounts();
    return Object.values(counts).reduce((a, b) => a + b, 0);
  };

  describe('job id (rule 5)', () => {
    it('is derived from the userId, one per user', () => {
      expect(orderJobId('alice')).toBe('order-alice');
    });

    it('works for ids BullMQ would reject as they are (all digits, or a colon)', () => {
      expect(orderJobId('123')).toBe('order-123');
      expect(orderJobId('a:b')).toBe('order-a%3Ab');
    });
  });

  describe('purchase', () => {
    it('SUCCESS enqueues one order job with the production retry options', async () => {
      await setSale();
      expect(await service.purchase('alice')).toBe('SUCCESS');

      const job = await orders.queue.getJob(orderJobId('alice'));
      expect(job?.data).toEqual({ userId: 'alice' });
      expect(job?.opts.attempts).toBe(ORDER_JOB_OPTIONS.attempts);
      expect(job?.opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
      expect(ORDER_JOB_OPTIONS.attempts).toBe(5);
    });

    it('enqueuing the same userId twice creates one job', async () => {
      await setSale();
      await orders.enqueue('bob');
      await orders.enqueue('bob');
      expect(await jobCount()).toBe(1);
    });

    it('a repeat purchase is ALREADY_PURCHASED and still leaves one job', async () => {
      await setSale();
      await service.purchase('alice');
      expect(await service.purchase('alice')).toBe('ALREADY_PURCHASED');
      expect(await jobCount()).toBe(1);
    });

    it('ALREADY_PURCHASED re-enqueues, repairing a reservation that never got a job (03 edge)', async () => {
      await setSale();
      // What a timed-out purchase leaves behind: a unit reserved in Redis, no job.
      await admin.sadd(SALE_KEYS.buyers, 'alice');
      await admin.decr(SALE_KEYS.stock);

      expect(await service.purchase('alice')).toBe('ALREADY_PURCHASED');
      expect(await orders.queue.getJob(orderJobId('alice'))).toBeDefined();
    });

    it('SOLD_OUT enqueues nothing', async () => {
      await setSale(0);
      expect(await service.purchase('alice')).toBe('SOLD_OUT');
      expect(await jobCount()).toBe(0);
    });
  });

  it('a queue created while Redis is still connecting works once it is up (API startup)', async () => {
    // In the API the queue is built before the shared client has connected. This once left the
    // queue broken for good (see the comment in OrderQueue's constructor).
    await setSale();
    const early = createRedisClient(
      `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    );
    const earlyQueue = new OrderQueue(early); // client not connected yet
    try {
      await earlyQueue.onModuleInit();
      await earlyQueue.enqueue('carol');
      expect(await earlyQueue.queue.getJob(orderJobId('carol'))).toBeDefined();
    } finally {
      await earlyQueue.close();
      await early.quit();
    }
  });

  // The queue loses Redis after startup while the gate's connection is fine: the reservation
  // succeeds, then the enqueue fails. This is exactly the case rule 6 is about.
  describe('enqueue failure (rule 6, no lost stock)', () => {
    let lost: Redis;
    let lostQueue: OrderQueue;
    let broken: PurchaseService;

    beforeAll(async () => {
      lost = createRedisClient(`redis://${container.getHost()}:${container.getMappedPort(6379)}`);
      lostQueue = new OrderQueue(lost);
      await lostQueue.onModuleInit();
      lost.disconnect(); // Redis "goes away" for the queue only
      broken = new PurchaseService(client, lostQueue);
      await broken.onModuleInit();
    });

    afterAll(async () => {
      await lostQueue.close().catch(() => undefined);
    });

    it('after SUCCESS: gives the unit back, removes the buyer, answers 503', async () => {
      await setSale(10);
      await expect(broken.purchase('alice')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await stock()).toBe(10);
      expect(await isBuyer('alice')).toBe(false);
    });

    it('after ALREADY_PURCHASED: answers 503 but keeps the reservation', async () => {
      await setSale(10);
      await service.purchase('alice'); // real purchase through the working queue
      await expect(broken.purchase('alice')).rejects.toBeInstanceOf(ServiceUnavailableException);
      // Never release here: this user may already have an order in the queue or in Postgres.
      expect(await isBuyer('alice')).toBe(true);
      expect(await stock()).toBe(9);
    });
  });
});
