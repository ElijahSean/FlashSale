import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Client } from 'pg';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
// The API's real code, so the contract and the end-to-end test use what production runs.
import { OrderQueue, ORDERS_QUEUE as API_QUEUE } from '../../api/src/purchase/order-queue';
import { PurchaseService } from '../../api/src/purchase/purchase.service';
import { createRedisClient, waitForRedisReady } from '../../api/src/redis/redis-client';
import { SALE_KEYS } from '../../api/src/sale/sale.keys';
import { BUYERS_KEY, ORDERS_QUEUE, OrderJob } from './orders.queue';
import { createPrisma, OrderWriter } from './prisma';
import { createSaveOrder } from './save-order';
import { startOrderWorker } from './worker';

// The worker against a real Redis and a real Postgres (Testcontainers). Needs Docker running.
jest.setTimeout(180_000);

const HOUR = 3_600_000;
const MIGRATIONS = join(__dirname, '../../api/prisma/migrations');

describe('order worker with real Redis and Postgres', () => {
  let redisC: StartedTestContainer;
  let pgC: StartedTestContainer;
  let redisUrl: string;
  let dbUrl: string;
  let admin: Redis; // plain client for arranging and inspecting Redis
  let db: Client; // plain pg client for inspecting Postgres
  let prisma: ReturnType<typeof createPrisma>;
  let queueConn: Redis;
  let queue: Queue<OrderJob>; // stands in for the API when a test adds jobs directly
  const cleanup: (() => Promise<unknown>)[] = [];

  beforeAll(async () => {
    [redisC, pgC] = await Promise.all([
      new GenericContainer('redis:7.4-alpine').withExposedPorts(6379).start(),
      new GenericContainer('postgres:17-alpine')
        .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
    ]);
    redisUrl = `redis://${redisC.getHost()}:${redisC.getMappedPort(6379)}`;
    dbUrl = `postgresql://test:test@${pgC.getHost()}:${pgC.getMappedPort(5432)}/test`;

    // Apply the real migrations, in order, so the test runs against the production schema.
    db = new Client({ connectionString: dbUrl });
    await db.connect();
    for (const dir of readdirSync(MIGRATIONS)
      .filter((d) => !d.endsWith('.toml'))
      .sort()) {
      await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
    }

    admin = new Redis(redisUrl);
    prisma = createPrisma(dbUrl);
    queueConn = new Redis(redisUrl);
    queue = new Queue<OrderJob>(ORDERS_QUEUE, { connection: queueConn });
  });

  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  afterAll(async () => {
    await queue?.close();
    await queueConn?.quit();
    await prisma?.$disconnect();
    await db?.end();
    await admin?.quit();
    await Promise.all([redisC?.stop(), pgC?.stop()]);
  });

  /** Empty Redis and the orders table, then open a sale with this stock. */
  async function reset(stock = 10) {
    const [s] = await admin.time();
    const now = Number(s) * 1000;
    await admin.flushall();
    await db.query('TRUNCATE orders');
    await admin.hset(SALE_KEYS.config, {
      startsAt: String(now - HOUR),
      endsAt: String(now + HOUR),
      initialStock: String(stock),
    });
    await admin.set(SALE_KEYS.stock, stock);
  }

  const rows = async (userId?: string) => {
    const r = userId
      ? await db.query('SELECT count(*)::int AS n FROM orders WHERE "userId" = $1', [userId])
      : await db.query('SELECT count(*)::int AS n FROM orders');
    return r.rows[0].n as number;
  };

  /** A worker for one test, closed afterwards. */
  function worker(opts: Parameters<typeof startOrderWorker>[0]) {
    const w = startOrderWorker(opts);
    cleanup.push(() => w.close());
    return w;
  }

  function workerConnection() {
    const c = new Redis(redisUrl, { maxRetriesPerRequest: null });
    cleanup.push(() => c.quit());
    return c;
  }

  /** Resolves when the job ends for good: completed, or failed on its last allowed try. */
  const settled = (w: Worker, jobId: string) =>
    new Promise<'completed' | 'failed'>((resolve) => {
      w.on('completed', (j: Job) => j.id === jobId && resolve('completed'));
      // BullMQ emits "failed" after every failed try, including ones it will retry.
      w.on('failed', (j: Job | undefined) => {
        if (j?.id === jobId && j.attemptsMade >= (j.opts.attempts ?? 1)) resolve('failed');
      });
    });

  it('shares the queue name and buyers key with the API (contract)', () => {
    expect(ORDERS_QUEUE).toBe(API_QUEUE);
    expect(BUYERS_KEY).toBe(SALE_KEYS.buyers);
  });

  describe('saveOrder (the job handler)', () => {
    it('writes one row for a buyer', async () => {
      await reset();
      await admin.sadd(BUYERS_KEY, 'alice');
      const save = createSaveOrder({ db: prisma, redis: admin });
      expect(await save({ userId: 'alice' })).toBe('saved');
      expect(await rows('alice')).toBe(1);
    });

    it('processing the same job twice creates one row (rule 5)', async () => {
      await reset();
      await admin.sadd(BUYERS_KEY, 'alice');
      const save = createSaveOrder({ db: prisma, redis: admin });
      expect(await save({ userId: 'alice' })).toBe('saved');
      expect(await save({ userId: 'alice' })).toBe('duplicate');
      expect(await rows('alice')).toBe(1);
    });

    it('writes nothing for a user who no longer holds a unit (Redis decides, rule 3)', async () => {
      await reset();
      const save = createSaveOrder({ db: prisma, redis: admin });
      expect(await save({ userId: 'released-user' })).toBe('not_a_buyer');
      expect(await rows()).toBe(0);
    });
  });

  describe('running worker', () => {
    it('a successful purchase becomes exactly one order row within 2 s', async () => {
      await reset();
      const api = createRedisClient(redisUrl);
      await waitForRedisReady(api);
      const orders = new OrderQueue(api);
      cleanup.push(
        () => api.quit(),
        () => orders.close(),
      );
      const purchase = new PurchaseService(api, orders);
      await purchase.onModuleInit();
      worker({ connection: workerConnection(), db: prisma, redis: admin });

      const started = Date.now();
      expect(await purchase.purchase('alice')).toBe('SUCCESS');
      while ((await rows('alice')) === 0 && Date.now() - started < 2000) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(await rows('alice')).toBe(1);
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it('retries with backoff while Postgres fails, then saves', async () => {
      await reset();
      await admin.sadd(BUYERS_KEY, 'alice');
      // Postgres "down" for the first two tries, then back.
      let calls = 0;
      const flaky: OrderWriter = {
        $executeRaw: ((...args: Parameters<OrderWriter['$executeRaw']>) => {
          calls += 1;
          if (calls <= 2) return Promise.reject(new Error('connect ECONNREFUSED (simulated)'));
          return prisma.$executeRaw(...args);
        }) as OrderWriter['$executeRaw'],
      };
      const w = worker({ connection: workerConnection(), db: flaky, redis: admin });
      const done = settled(w, 'order-alice');
      await queue.add(
        'order',
        { userId: 'alice' },
        {
          jobId: 'order-alice',
          attempts: 5,
          backoff: { type: 'exponential', delay: 20 },
        },
      );

      expect(await done).toBe('completed');
      expect((await queue.getJob('order-alice'))?.attemptsMade).toBe(3);
      expect(await rows('alice')).toBe(1);
    });

    it('after 5 failures the job stays in the failed set with the error (dead letter)', async () => {
      await reset();
      await admin.sadd(BUYERS_KEY, 'alice');
      const deadDb = createPrisma('postgresql://test:test@127.0.0.1:1/test'); // nothing listens
      cleanup.push(() => deadDb.$disconnect());
      const w = worker({ connection: workerConnection(), db: deadDb, redis: admin });
      const done = settled(w, 'order-alice');
      await queue.add(
        'order',
        { userId: 'alice' },
        {
          jobId: 'order-alice',
          attempts: 5,
          backoff: { type: 'exponential', delay: 20 },
          removeOnFail: false,
        },
      );

      expect(await done).toBe('failed');
      const job = await queue.getJob('order-alice');
      expect(await job?.getState()).toBe('failed');
      expect(job?.attemptsMade).toBe(5);
      expect(job?.failedReason).toBeTruthy();
    });

    it('graceful shutdown finishes the job in progress', async () => {
      await reset();
      await admin.sadd(BUYERS_KEY, 'alice');
      // A slow Postgres: the insert takes 500 ms, so close() arrives mid-job.
      const slow: OrderWriter = {
        $executeRaw: (async (...args: Parameters<OrderWriter['$executeRaw']>) => {
          await new Promise((r) => setTimeout(r, 500));
          return prisma.$executeRaw(...args);
        }) as OrderWriter['$executeRaw'],
      };
      const w = startOrderWorker({ connection: workerConnection(), db: slow, redis: admin });
      const active = new Promise((r) => w.once('active', r));
      await queue.add('order', { userId: 'alice' }, { jobId: 'order-alice' });
      await active;

      await w.close(); // what SIGTERM calls
      expect(await rows('alice')).toBe(1);
      expect(await (await queue.getJob('order-alice'))?.getState()).toBe('completed');
    });
  });

  // Requirement 04's last criterion, end to end: the API's gate and queue, this worker, Postgres.
  it('reconciliation after the queue drains: initialStock - stock = buyers = rows', async () => {
    const initialStock = 20;
    await reset(initialStock);
    // Five API "replicas", each with its own fail-fast client, like production.
    const apis = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const c = createRedisClient(redisUrl);
        await waitForRedisReady(c);
        const q = new OrderQueue(c);
        cleanup.push(
          () => c.quit(),
          () => q.close(),
        );
        const s = new PurchaseService(c, q);
        await s.onModuleInit();
        return s;
      }),
    );
    worker({ connection: workerConnection(), db: prisma, redis: admin, concurrency: 10 });

    // 200 buyers, plus every one of them clicking twice.
    const users = Array.from({ length: 200 }, (_, i) => `user-${i}`);
    await Promise.all(
      [...users, ...users].map((u, i) => apis[i % apis.length].purchase(u).catch(() => 'ERROR')),
    );

    // Wait until nothing is waiting, running or scheduled for retry.
    const deadline = Date.now() + 30_000;
    for (;;) {
      const c = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      if (Object.values(c).every((n) => n === 0)) break;
      if (Date.now() > deadline) throw new Error(`queue did not drain: ${JSON.stringify(c)}`);
      await new Promise((r) => setTimeout(r, 50));
    }

    const sold = initialStock - Number(await admin.get(SALE_KEYS.stock));
    expect(sold).toBe(initialStock);
    expect(await admin.scard(SALE_KEYS.buyers)).toBe(sold);
    expect(await rows()).toBe(sold);
  });
});
