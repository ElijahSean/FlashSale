import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { configureApp } from '../app.setup';
import { REDIS, RedisModule } from '../redis/redis.module';
import { SaleModule } from './sale.module';
import { SALE_KEYS } from './sale.keys';

// Integration test: a real Redis in a throwaway container (Testcontainers), and the real
// SaleModule wiring. Needs Docker running.
jest.setTimeout(120_000);

const baseEnv = {
  SALE_STARTS_AT: '2020-01-01T00:00:00Z',
  SALE_ENDS_AT: '2099-01-01T00:00:00Z',
  SALE_STOCK: '100',
  PRODUCT_NAME: 'Sneaker',
  PRODUCT_PRICE: '$99.00',
  PRODUCT_IMAGE_URL: '/images/product.jpg',
};

describe('SaleModule with real Redis', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  let redis: Redis;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7.4-alpine').withExposedPorts(6379).start();
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    redis = new Redis(redisUrl);
  });

  afterAll(async () => {
    await redis?.quit();
    await container?.stop();
  });

  // Boots the app the same way main.ts does, with env values supplied by the test.
  // stubRedis: for tests where startup is expected to fail. A real client created by a failed
  // startup is never closed, and its reconnect loop would keep Jest from exiting.
  async function boot(env: Record<string, string>, { stubRedis = false } = {}) {
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ...env, REDIS_URL: redisUrl })],
        }),
        RedisModule,
        SaleModule,
      ],
    });
    if (stubRedis) builder.overrideProvider(REDIS).useValue({ quit: async () => {} });
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it('seeds on first boot and never overwrites on later boots', async () => {
    await redis.flushall();

    const first = await boot(baseEnv);
    expect(await redis.get(SALE_KEYS.stock)).toBe('100');
    expect(await redis.hgetall(SALE_KEYS.config)).toEqual({
      startsAt: String(Date.parse(baseEnv.SALE_STARTS_AT)),
      endsAt: String(Date.parse(baseEnv.SALE_ENDS_AT)),
      initialStock: '100',
      productName: 'Sneaker',
      productPrice: '$99.00',
      productImageUrl: '/images/product.jpg',
    });
    await first.close();

    // Simulate units sold, then restart with different env values.
    await redis.set(SALE_KEYS.stock, '42');
    const second = await boot({ ...baseEnv, SALE_STOCK: '5', PRODUCT_NAME: 'Other' });
    expect(await redis.get(SALE_KEYS.stock)).toBe('42');
    expect(await redis.hget(SALE_KEYS.config, 'productName')).toBe('Sneaker');
    expect(await redis.hget(SALE_KEYS.config, 'initialStock')).toBe('100');
    await second.close();
  });

  it('serves GET /api/sale without a token', async () => {
    await redis.flushall();
    const app = await boot(baseEnv);

    const res = await app.inject({ method: 'GET', url: '/api/sale' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      product: { name: 'Sneaker', price: '$99.00', imageUrl: '/images/product.jpg' },
      status: 'active',
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2099-01-01T00:00:00.000Z',
      stockRemaining: 100,
    });
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
    await app.close();
  });

  it('refuses to start with an invalid config', async () => {
    await expect(boot({ ...baseEnv, SALE_STOCK: '0' }, { stubRedis: true })).rejects.toThrow(
      'SALE_STOCK must be a positive whole number',
    );
  });
});
