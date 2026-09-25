import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Client } from 'pg';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { configureApp, createAdapter } from '../app.setup';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderQueue, orderJobId } from '../purchase/order-queue';
import { PurchaseModule } from '../purchase/purchase.module';
import { RedisModule } from '../redis/redis.module';
import { SaleModule } from '../sale/sale.module';
import { SALE_KEYS } from '../sale/sale.keys';
import { AdminTokenGuard } from './admin-token.guard';
import { adminModule } from './admin.module';

// Requirement 07: the test-only reset route. Real Redis and Postgres, requests through inject().
jest.setTimeout(180_000);

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const ADMIN_TOKEN = 'admin-token-that-is-at-least-32-characters';
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SALE_STARTS_AT = '2026-01-01T00:00:00.000Z';
const SALE_ENDS_AT = '2099-01-01T00:00:00.000Z';

describe('POST /api/admin/reset', () => {
  let redisC: StartedTestContainer;
  let pgC: StartedTestContainer;
  let redis: Redis; // plain client for inspecting Redis
  let db: Client; // plain pg client for arranging and inspecting Postgres
  let baseEnv: Record<string, string>;
  const apps: NestFastifyApplication[] = [];

  beforeAll(async () => {
    [redisC, pgC] = await Promise.all([
      new GenericContainer('redis:7.4-alpine').withExposedPorts(6379).start(),
      new GenericContainer('postgres:17-alpine')
        .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
    ]);
    const redisUrl = `redis://${redisC.getHost()}:${redisC.getMappedPort(6379)}`;
    const dbUrl = `postgresql://test:test@${pgC.getHost()}:${pgC.getMappedPort(5432)}/test`;

    db = new Client({ connectionString: dbUrl });
    await db.connect();
    for (const dir of readdirSync(MIGRATIONS)
      .filter((d) => !d.endsWith('.toml'))
      .sort()) {
      await db.query(readFileSync(join(MIGRATIONS, dir, 'migration.sql'), 'utf8'));
    }
    redis = new Redis(redisUrl);

    baseEnv = {
      REDIS_URL: redisUrl,
      DATABASE_URL: dbUrl,
      JWT_SECRET: SECRET,
      WEB_ORIGIN: 'http://localhost:8080',
      RATE_LIMIT_USER_PER_SEC: '1000',
      RATE_LIMIT_IP_PER_SEC: '1000',
      SALE_STARTS_AT,
      SALE_ENDS_AT,
      SALE_STOCK: '10',
      PRODUCT_NAME: 'Test Sneaker',
      PRODUCT_PRICE: '$1.00',
      ADMIN_TOKEN,
    };
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    delete process.env.ENABLE_ADMIN;
    await db?.end();
    await redis?.quit();
    await Promise.all([redisC?.stop(), pgC?.stop()]);
  });

  /**
   * Boots the modules the way AppModule does. ENABLE_ADMIN goes into process.env, because that is
   * where ConditionalModule reads it (from the .env file or the container environment).
   */
  async function boot(enableAdmin: string | undefined, env: Record<string, string> = {}) {
    if (enableAdmin === undefined) delete process.env.ENABLE_ADMIN;
    else process.env.ENABLE_ADMIN = enableAdmin;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ...baseEnv, ...env })],
        }),
        RedisModule,
        PrismaModule,
        SaleModule,
        PurchaseModule,
        adminModule(),
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter());
    apps.push(app);
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  const reset = (app: NestFastifyApplication, token?: string, payload: object = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/reset',
      headers: token ? { 'x-admin-token': token } : {},
      payload,
    });

  const buy = (app: NestFastifyApplication, userId: string) =>
    app.inject({
      method: 'POST',
      url: '/api/purchases',
      headers: {
        authorization: `Bearer ${new JwtService({ secret: SECRET }).sign({ sub: userId }, { expiresIn: 60 })}`,
      },
    });

  describe('when admin is off', () => {
    it.each([undefined, 'false', '1', 'TRUE'])(
      'is a 404 with ENABLE_ADMIN=%s (only exactly "true" turns it on)',
      async (value) => {
        const app = await boot(value);
        expect((await reset(app, ADMIN_TOKEN)).statusCode).toBe(404);
      },
    );
  });

  // The guard is built at startup, so a throwing constructor stops the API. Tested directly: a
  // failed boot would leave its Redis client reconnecting and keep Jest from exiting (see 02).
  it.each([undefined, '', 'short'])(
    'refuses to start with ENABLE_ADMIN=true and ADMIN_TOKEN=%j (under 32 characters)',
    (token) => {
      const config = new ConfigService({ ADMIN_TOKEN: token });
      expect(() => new AdminTokenGuard(config)).toThrow(/ADMIN_TOKEN/);
    },
  );

  describe('when admin is on', () => {
    let app: NestFastifyApplication;
    beforeAll(async () => {
      app = await boot('true');
    });

    it('answers 401 without the token or with a wrong one, and changes nothing', async () => {
      expect((await buy(app, 'keep')).statusCode).toBe(201);
      expect((await reset(app)).statusCode).toBe(401);
      expect((await reset(app, `${ADMIN_TOKEN}x`)).statusCode).toBe(401);
      // A user's JWT is not an admin token.
      expect((await reset(app, SECRET)).statusCode).toBe(401);
      expect(await redis.sismember(SALE_KEYS.buyers, 'keep')).toBe(1);
    });

    it('empties buyers, orders and the queue, and puts the .env stock and window back', async () => {
      expect((await reset(app, ADMIN_TOKEN)).statusCode).toBe(200);
      for (const user of ['u1', 'u2']) expect((await buy(app, user)).statusCode).toBe(201);
      // The worker is not running here, so stand in for it with one saved order.
      await db.query(`INSERT INTO orders ("userId") VALUES ('u1')`);

      const res = await reset(app, ADMIN_TOKEN);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ stock: 10, startsAt: SALE_STARTS_AT, endsAt: SALE_ENDS_AT });

      expect(await redis.get(SALE_KEYS.stock)).toBe('10');
      expect(await redis.scard(SALE_KEYS.buyers)).toBe(0);
      expect((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n).toBe(0);
      const counts = await app.get(OrderQueue).queue.getJobCounts();
      expect(Object.values(counts).every((n) => n === 0)).toBe(true);

      // A rerun with the same user queues a fresh job (rule 5 would ignore a leftover one).
      expect((await buy(app, 'u1')).statusCode).toBe(201);
      expect(await app.get(OrderQueue).queue.getJob(orderJobId('u1'))).toBeDefined();
    });

    it('sets stock and a window that starts in N seconds by the Redis clock (rule 9)', async () => {
      const res = await reset(app, ADMIN_TOKEN, {
        stock: 5,
        startsInSeconds: 60,
        durationSeconds: 10,
      });
      expect(res.statusCode).toBe(200);
      const { startsAt, endsAt } = res.json<{ startsAt: string; endsAt: string }>();
      const [seconds] = await redis.time();
      expect(Date.parse(startsAt) - Number(seconds) * 1000).toBeGreaterThan(58_000);
      expect(Date.parse(startsAt) - Number(seconds) * 1000).toBeLessThanOrEqual(61_000);
      expect(Date.parse(endsAt) - Date.parse(startsAt)).toBe(10_000);
      expect(await redis.hget(SALE_KEYS.config, 'initialStock')).toBe('5');

      const early = await buy(app, 'early');
      expect(early.statusCode).toBe(403);
      expect(early.json()).toMatchObject({ result: 'NOT_STARTED' });
      expect(await redis.get(SALE_KEYS.stock)).toBe('5');
    });

    it.each<[object, string]>([
      [{ startsInSeconds: 5 }, 'a window with no duration'],
      [{ durationSeconds: 5 }, 'a duration with no start'],
      [{ stock: 0 }, 'zero stock'],
      [{ stock: '10' }, 'stock as a string'],
      [{ startsInSeconds: 0, durationSeconds: 0 }, 'an empty window'],
    ])('answers 400 for %j (%s)', async (payload) => {
      expect((await reset(app, ADMIN_TOKEN, payload)).statusCode).toBe(400);
    });
  });
});
