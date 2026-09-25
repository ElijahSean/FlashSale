import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Client } from 'pg';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { configureApp, createAdapter } from '../app.setup';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { REDIS, RedisModule } from '../redis/redis.module';
import { SALE_KEYS } from '../sale/sale.keys';
import { PurchaseModule } from './purchase.module';
import { PurchaseService } from './purchase.service';

// Requirement 05 over HTTP: login, AuthGuard, rate limits, result codes, /me, and the app-wide
// settings (helmet, CORS, body limit). Real Redis and Postgres (Testcontainers), real modules.
// Requests go through Fastify's inject(): the full HTTP pipeline without opening a port.
jest.setTimeout(180_000);

const HOUR = 3_600_000;
const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const WEB_ORIGIN = 'http://localhost:5173';
const MIGRATIONS = join(__dirname, '../../prisma/migrations');

describe('purchase API over HTTP', () => {
  let redisC: StartedTestContainer;
  let pgC: StartedTestContainer;
  let admin: Redis; // plain client for arranging and inspecting Redis
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
    admin = new Redis(redisUrl);

    baseEnv = {
      REDIS_URL: redisUrl,
      DATABASE_URL: dbUrl,
      JWT_SECRET: SECRET,
      WEB_ORIGIN,
      // High by default so the other tests never trip them. The 429 tests lower them.
      RATE_LIMIT_USER_PER_SEC: '1000',
      RATE_LIMIT_IP_PER_SEC: '1000',
    };
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    await db?.end();
    await admin?.quit();
    await Promise.all([redisC?.stop(), pgC?.stop()]);
  });

  /** Boots the API modules the way main.ts does, with env values supplied by the test. */
  async function boot(env: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ...baseEnv, ...env })],
        }),
        RedisModule,
        PrismaModule,
        AuthModule,
        PurchaseModule,
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    apps.push(app);
    return app;
  }

  /** Empty Redis and the orders table, then set the sale window and stock. */
  async function setSale({ stock = 10, startsIn = -HOUR, endsIn = HOUR } = {}) {
    const [s] = await admin.time();
    const now = Number(s) * 1000;
    await admin.flushall();
    await db.query('TRUNCATE orders');
    await admin.hset(SALE_KEYS.config, {
      startsAt: String(now + startsIn),
      endsAt: String(now + endsIn),
      initialStock: String(stock),
    });
    await admin.set(SALE_KEYS.stock, stock);
  }

  const login = (app: NestFastifyApplication, userId: unknown, remoteAddress?: string) =>
    app.inject({ method: 'POST', url: '/api/auth/demo-login', payload: { userId }, remoteAddress });

  async function tokenFor(app: NestFastifyApplication, userId: string) {
    const res = await login(app, userId);
    expect(res.statusCode).toBe(200);
    return res.json<{ accessToken: string }>().accessToken;
  }

  const buy = (
    app: NestFastifyApplication,
    token?: string,
    { payload, remoteAddress }: { payload?: object; remoteAddress?: string } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/purchases',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload,
      remoteAddress,
    });

  const me = (app: NestFastifyApplication, token: string) =>
    app.inject({
      method: 'GET',
      url: '/api/purchases/me',
      headers: { authorization: `Bearer ${token}` },
    });

  const tokenPayload = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

  const noStackTrace = (body: string) => {
    expect(body).not.toContain('"stack"');
    expect(body).not.toMatch(/\bat \S+ \(/); // a stack frame looks like "at fn (file:line:col)"
  };

  describe('with a working Redis and Postgres', () => {
    let app: NestFastifyApplication;
    beforeAll(async () => {
      app = await boot();
    });

    describe('demo login', () => {
      it('normalizes the userId into the token (rule 10)', async () => {
        const res = await login(app, ' Eli@X.com ');
        expect(res.statusCode).toBe(200);
        const { accessToken, userId } = res.json<{ accessToken: string; userId: string }>();
        expect(userId).toBe('eli@x.com');
        const payload = tokenPayload(accessToken);
        expect(payload.sub).toBe('eli@x.com');
        // About 30 minutes.
        expect(Number(payload.exp) - Number(payload.iat)).toBe(30 * 60);
      });

      it.each([
        ['empty', ''],
        ['not a string', 42],
        ['255 characters', 'a'.repeat(255)],
      ])('answers 400 for a userId that is %s', async (_case, userId) => {
        const res = await login(app, userId);
        expect(res.statusCode).toBe(400);
        noStackTrace(res.body);
      });
    });

    describe('POST /api/purchases', () => {
      it('answers 401 without a token, with a tampered token, and with an expired token', async () => {
        await setSale();
        const token = await tokenFor(app, 'alice');
        const [header, , signature] = token.split('.');
        const tampered = `${header}.${Buffer.from(JSON.stringify({ sub: 'bob' })).toString('base64url')}.${signature}`;
        const expired = new JwtService({ secret: SECRET }).sign({
          sub: 'alice',
          exp: Math.floor(Date.now() / 1000) - 10,
        });

        for (const t of [undefined, tampered, expired]) {
          const res = await buy(app, t);
          expect(res.statusCode).toBe(401);
          noStackTrace(res.body);
        }
        // None of them reached the gate.
        expect(await admin.get(SALE_KEYS.stock)).toBe('10');
      });

      it('ignores a userId in the body: the buyer is whoever the token says (rule 8)', async () => {
        await setSale();
        const token = await tokenFor(app, 'alice');
        const res = await buy(app, token, { payload: { userId: 'bob' } });
        expect(res.statusCode).toBe(201);
        expect(await admin.sismember(SALE_KEYS.buyers, 'alice')).toBe(1);
        expect(await admin.sismember(SALE_KEYS.buyers, 'bob')).toBe(0);
      });

      it('SUCCESS answers 201, a second try 409', async () => {
        await setSale();
        const token = await tokenFor(app, 'alice');
        const first = await buy(app, token);
        expect(first.statusCode).toBe(201);
        expect(first.json()).toMatchObject({ result: 'SUCCESS' });

        const second = await buy(app, token);
        expect(second.statusCode).toBe(409);
        expect(second.json()).toMatchObject({ result: 'ALREADY_PURCHASED' });
      });

      it('SOLD_OUT answers 410', async () => {
        await setSale({ stock: 0 });
        const res = await buy(app, await tokenFor(app, 'alice'));
        expect(res.statusCode).toBe(410);
        expect(res.json()).toMatchObject({ result: 'SOLD_OUT' });
      });

      it('NOT_STARTED and ENDED answer 403, told apart by the body', async () => {
        const token = await tokenFor(app, 'alice');

        await setSale({ startsIn: HOUR, endsIn: 2 * HOUR });
        const early = await buy(app, token);
        expect(early.statusCode).toBe(403);
        expect(early.json()).toMatchObject({ result: 'NOT_STARTED' });

        await setSale({ startsIn: -2 * HOUR, endsIn: -HOUR });
        const late = await buy(app, token);
        expect(late.statusCode).toBe(403);
        expect(late.json()).toMatchObject({ result: 'ENDED' });
      });
    });

    describe('GET /api/purchases/me', () => {
      it('answers not purchased, then reserved, then confirmed once the order is saved', async () => {
        await setSale();
        const token = await tokenFor(app, 'carol');

        expect((await me(app, token)).json()).toEqual({ purchased: false });

        expect((await buy(app, token)).statusCode).toBe(201);
        expect((await me(app, token)).json()).toEqual({ purchased: true, status: 'reserved' });

        // Stands in for the worker (04), which is tested end to end in apps/worker.
        await db.query('INSERT INTO orders ("userId") VALUES ($1)', ['carol']);
        expect((await me(app, token)).json()).toEqual({ purchased: true, status: 'confirmed' });
      });

      it('answers 401 without a token', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/purchases/me' });
        expect(res.statusCode).toBe(401);
      });
    });

    describe('app-wide settings', () => {
      it('sends helmet security headers', async () => {
        const res = await login(app, 'alice');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
        expect(res.headers['strict-transport-security']).toBeDefined();
      });

      it('allows the web app origin and nobody else (CORS)', async () => {
        const preflight = (origin: string) =>
          app.inject({
            method: 'OPTIONS',
            url: '/api/purchases',
            headers: {
              origin,
              'access-control-request-method': 'POST',
              'access-control-request-headers': 'authorization',
            },
          });

        const ours = await preflight(WEB_ORIGIN);
        expect(ours.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);

        const theirs = await preflight('https://evil.example');
        expect(theirs.headers['access-control-allow-origin']).toBeUndefined();
      });

      it('answers 413 for a body over 1 KB', async () => {
        const res = await login(app, 'a'.repeat(2000));
        expect(res.statusCode).toBe(413);
        noStackTrace(res.body);
      });

      it('answers 400 without a stack trace for broken JSON', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/demo-login',
          headers: { 'content-type': 'application/json' },
          payload: '{"userId":',
        });
        expect(res.statusCode).toBe(400);
        noStackTrace(res.body);
      });
    });
  });

  describe('rate limits (429 before the Lua script runs)', () => {
    let app: NestFastifyApplication;
    let purchase: jest.SpyInstance;
    beforeAll(async () => {
      app = await boot({ RATE_LIMIT_USER_PER_SEC: '2', RATE_LIMIT_IP_PER_SEC: '3' });
      purchase = jest.spyOn(app.get(PurchaseService), 'purchase');
    });
    beforeEach(() => purchase.mockClear());

    it('per user: the third request in a second answers 429', async () => {
      await setSale();
      const token = new JwtService({ secret: SECRET }).sign({ sub: 'alice' }, { expiresIn: 60 });
      // A different address each time, so only the per-user limit can trip.
      const codes = [];
      for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
        codes.push((await buy(app, token, { remoteAddress: ip })).statusCode);
      }
      expect(codes).toEqual([201, 409, 429]);
      expect(purchase).toHaveBeenCalledTimes(2);
    });

    it('per IP: the fourth request from one address answers 429, even for new users', async () => {
      await setSale();
      const signer = new JwtService({ secret: SECRET });
      const codes = [];
      for (const user of ['u1', 'u2', 'u3', 'u4']) {
        const token = signer.sign({ sub: user }, { expiresIn: 60 });
        codes.push((await buy(app, token, { remoteAddress: '10.0.0.9' })).statusCode);
      }
      expect(codes).toEqual([201, 201, 201, 429]);
      expect(purchase).toHaveBeenCalledTimes(3);
      expect(await admin.get(SALE_KEYS.stock)).toBe('7');
    });

    it('demo login is limited per IP too', async () => {
      await setSale();
      const codes = [];
      for (const user of ['v1', 'v2', 'v3', 'v4']) {
        codes.push((await login(app, user, '10.0.0.20')).statusCode);
      }
      expect(codes).toEqual([200, 200, 200, 429]);
    });

    it('the limit resets after the one-second window', async () => {
      await setSale();
      const login4 = async () => {
        const codes = [];
        for (const user of ['w1', 'w2', 'w3', 'w4']) {
          codes.push((await login(app, user, '10.0.0.30')).statusCode);
        }
        return codes;
      };
      expect(await login4()).toEqual([200, 200, 200, 429]);
      await new Promise((r) => setTimeout(r, 1100));
      expect((await login(app, 'w5', '10.0.0.30')).statusCode).toBe(200);
    });
  });

  describe('when Postgres is down', () => {
    it('purchases still work and /me answers from Redis (reserved)', async () => {
      // Nothing listens on port 1: every Prisma query fails. The purchase path never uses
      // Postgres (rule 3), so it is unaffected.
      const app = await boot({ DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test' });
      await setSale();
      const token = await tokenFor(app, 'dave');
      expect((await buy(app, token)).statusCode).toBe(201);
      const res = await me(app, token);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ purchased: true, status: 'reserved' });
    });
  });

  describe('when Redis is down (rule 4, fail closed)', () => {
    it('purchase, /me and login answer 503 without a stack trace', async () => {
      const app = await boot();
      await setSale();
      const token = await tokenFor(app, 'erin');
      app.get<Redis>(REDIS).disconnect(); // this app loses Redis; the test's admin client does not

      // The rate limit is the first Redis call on each route, so it is the one that answers 503
      // here. The purchase code's own 503 path is tested in purchase.int.spec.ts (03).
      for (const res of [await buy(app, token), await me(app, token), await login(app, 'erin')]) {
        expect(res.statusCode).toBe(503);
        noStackTrace(res.body);
      }
      expect(await admin.get(SALE_KEYS.stock)).toBe('10');
    });
  });

  describe('startup', () => {
    // Only the auth wiring, with Redis stubbed: a real client (or queue) created by a failed
    // startup is never closed, and its reconnect loop would keep Jest from exiting (see 02).
    const bootAuth = (jwtSecret?: string) =>
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ ...baseEnv, JWT_SECRET: jwtSecret })],
          }),
          RedisModule,
          AuthModule,
        ],
      })
        .overrideProvider(REDIS)
        .useValue({ quit: async () => {} })
        .compile();

    it('fails without JWT_SECRET', async () => {
      await expect(bootAuth(undefined)).rejects.toThrow('JWT_SECRET');
    });

    it('fails with a JWT_SECRET shorter than 32 characters', async () => {
      await expect(bootAuth('short')).rejects.toThrow('JWT_SECRET');
    });
  });
});
