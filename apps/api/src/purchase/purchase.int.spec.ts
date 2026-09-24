import { ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { createRedisClient, waitForRedisReady } from '../redis/redis-client';
import { SALE_KEYS } from '../sale/sale.keys';
import { OrderQueue } from './order-queue';
import { PurchaseResult, PurchaseService } from './purchase.service';

// The purchase gate against a real Redis (Testcontainers). No Redis mocks: the point is to prove
// the Lua script itself is atomic. Needs Docker running.
jest.setTimeout(120_000);

const HOUR = 3_600_000;
// These tests call attempt() and release(), which never touch the order queue (that is 04's
// purchase(), tested in order-queue.int.spec.ts). An empty stand-in keeps them about the script.
const noQueue = {} as OrderQueue;

describe('PurchaseService (Lua gate) with real Redis', () => {
  let container: StartedTestContainer;
  let url: string;
  let admin: Redis; // plain client for arranging and inspecting state
  let client: Redis; // production-configured client used by the service
  let service: PurchaseService;

  beforeAll(async () => {
    // DEBUG is off by default in Redis 7; the timeout test needs DEBUG SLEEP. Test Redis only.
    container = await new GenericContainer('redis:7.4-alpine')
      .withCommand(['redis-server', '--enable-debug-command', 'yes'])
      .withExposedPorts(6379)
      .start();
    url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    admin = new Redis(url);
    client = createRedisClient(url);
    await waitForRedisReady(client);
    service = new PurchaseService(client, noQueue);
    await service.onModuleInit();
  });

  afterAll(async () => {
    await client?.quit();
    await admin?.quit();
    await container?.stop();
  });

  /** Redis's own clock in epoch ms: the clock the script uses (rule 9). */
  async function redisNow() {
    const [seconds, micros] = await admin.time();
    return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
  }

  /** Fresh sale state. Window defaults to "open": one hour either side of Redis's now. */
  async function setSale({
    stock = 10,
    startsAt,
    endsAt,
  }: { stock?: number; startsAt?: number; endsAt?: number } = {}) {
    const now = await redisNow();
    await admin.flushall();
    await admin.hset(SALE_KEYS.config, {
      startsAt: String(startsAt ?? now - HOUR),
      endsAt: String(endsAt ?? now + HOUR),
      initialStock: String(stock),
    });
    await admin.set(SALE_KEYS.stock, stock);
  }

  const stock = async () => Number(await admin.get(SALE_KEYS.stock));
  const count = (results: PurchaseResult[], r: PurchaseResult) =>
    results.filter((x) => x === r).length;

  describe('sale window (Redis TIME)', () => {
    it('returns NOT_STARTED before startsAt', async () => {
      await setSale({ startsAt: (await redisNow()) + HOUR });
      expect(await service.attempt('alice')).toBe('NOT_STARTED');
      expect(await stock()).toBe(10);
    });

    it('is open from the exact startsAt instant', async () => {
      await setSale({ startsAt: await redisNow() });
      expect(await service.attempt('alice')).toBe('SUCCESS');
    });

    it('returns ENDED at or after endsAt', async () => {
      const now = await redisNow();
      await setSale({ startsAt: now - HOUR, endsAt: now });
      expect(await service.attempt('alice')).toBe('ENDED');
      expect(await stock()).toBe(10);
    });

    it('ignores the API server clock (rule 9)', async () => {
      await setSale();
      // The API process thinks the sale ended a year ago. Redis says it is open, and Redis decides.
      const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 24 * HOUR);
      try {
        expect(await service.attempt('alice')).toBe('SUCCESS');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('single attempts', () => {
    it('SUCCESS takes exactly one unit and records the buyer', async () => {
      await setSale({ stock: 10 });
      expect(await service.attempt('alice')).toBe('SUCCESS');
      expect(await stock()).toBe(9);
      expect(await admin.sismember(SALE_KEYS.buyers, 'alice')).toBe(1);
    });

    it('ALREADY_PURCHASED for a returning buyer, stock unchanged', async () => {
      await setSale({ stock: 10 });
      await service.attempt('alice');
      expect(await service.attempt('alice')).toBe('ALREADY_PURCHASED');
      expect(await stock()).toBe(9);
    });

    it('SOLD_OUT at stock 0, and stock never goes negative', async () => {
      await setSale({ stock: 0 });
      expect(await service.attempt('alice')).toBe('SOLD_OUT');
      expect(await service.attempt('bob')).toBe('SOLD_OUT');
      expect(await stock()).toBe(0);
      expect(await admin.scard(SALE_KEYS.buyers)).toBe(0);
    });

    it('a buyer who comes back after sell-out sees ALREADY_PURCHASED, not SOLD_OUT', async () => {
      await setSale({ stock: 1 });
      await service.attempt('alice');
      expect(await service.attempt('alice')).toBe('ALREADY_PURCHASED');
    });
  });

  // The headline tests. Ten clients stand in for ten API replicas hitting one Redis at once.
  describe('concurrency (headline tests)', () => {
    let replicas: PurchaseService[];
    let replicaClients: Redis[];

    beforeAll(async () => {
      replicaClients = Array.from({ length: 10 }, () => createRedisClient(url));
      await Promise.all(replicaClients.map((c) => waitForRedisReady(c)));
      replicas = replicaClients.map((c) => new PurchaseService(c, noQueue));
      await Promise.all(replicas.map((r) => r.onModuleInit()));
    });

    afterAll(async () => {
      await Promise.all(replicaClients.map((c) => c.quit()));
    });

    it('NO OVERSELL: 1,000 unique users in parallel on stock 10 give exactly 10 SUCCESS', async () => {
      await setSale({ stock: 10 });

      const results = await Promise.all(
        Array.from({ length: 1_000 }, (_, i) => replicas[i % replicas.length].attempt(`user-${i}`)),
      );

      expect(count(results, 'SUCCESS')).toBe(10);
      expect(count(results, 'SOLD_OUT')).toBe(990);
      expect(await stock()).toBe(0);
      expect(await admin.scard(SALE_KEYS.buyers)).toBe(10);
    });

    it('ONE PER USER: 200 parallel attempts by one user on stock 10 give exactly 1 SUCCESS', async () => {
      await setSale({ stock: 10 });

      const results = await Promise.all(
        Array.from({ length: 200 }, (_, i) => replicas[i % replicas.length].attempt('alice')),
      );

      expect(count(results, 'SUCCESS')).toBe(1);
      expect(count(results, 'ALREADY_PURCHASED')).toBe(199);
      expect(await stock()).toBe(9);
      expect(await admin.scard(SALE_KEYS.buyers)).toBe(1);
    });
  });

  describe('release (compensation, rule 6)', () => {
    it('gives the unit back and removes the buyer', async () => {
      await setSale({ stock: 10 });
      await service.attempt('alice');
      expect(await service.release('alice')).toBe(true);
      expect(await stock()).toBe(10);
      expect(await admin.sismember(SALE_KEYS.buyers, 'alice')).toBe(0);
    });

    it('is safe to call twice: the second call changes nothing', async () => {
      await setSale({ stock: 10 });
      await service.attempt('alice');
      await service.release('alice');
      expect(await service.release('alice')).toBe(false);
      expect(await stock()).toBe(10);
    });

    it('changes nothing for a user who never bought', async () => {
      await setSale({ stock: 10 });
      expect(await service.release('stranger')).toBe(false);
      expect(await stock()).toBe(10);
    });
  });

  describe('fail closed (rule 4)', () => {
    it('Redis unreachable: attempt throws 503, no fallback', async () => {
      const dead = createRedisClient('redis://127.0.0.1:1'); // nothing listens on port 1
      try {
        await expect(new PurchaseService(dead, noQueue).attempt('alice')).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      } finally {
        dead.disconnect();
      }
    });

    it('Redis too slow: attempt times out with 503', async () => {
      await setSale({ stock: 10 });
      // Freeze Redis for 1 s, longer than the 500 ms command timeout.
      const sleeping = admin.call('DEBUG', 'SLEEP', '1');
      await new Promise((r) => setTimeout(r, 50));

      await expect(service.attempt('alice')).rejects.toBeInstanceOf(ServiceUnavailableException);
      await sleeping;

      // Known edge, handled in 04: the API gave up, but Redis still ran the script afterwards,
      // so alice holds a unit without an order. Recorded here so the behavior is explicit.
      expect(await admin.sismember(SALE_KEYS.buyers, 'alice')).toBe(1);
    });

    it('sale not configured: attempt throws 503', async () => {
      await admin.flushall();
      await expect(service.attempt('alice')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  it('reloads the script after SCRIPT FLUSH (NOSCRIPT) and succeeds', async () => {
    await setSale({ stock: 10 });
    await admin.script('FLUSH');
    expect(await service.attempt('alice')).toBe('SUCCESS');
    expect(await stock()).toBe(9);
  });
});
