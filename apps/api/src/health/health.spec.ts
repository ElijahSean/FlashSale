import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { REDIS } from '../redis/redis.module';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

// Both clients are mocked: this tests the decision logic, not the drivers.
// The real containers are checked manually (stop Redis, curl /health).
describe('health', () => {
  const redis = { ping: jest.fn() };
  const prisma = { $queryRaw: jest.fn() };
  let controller: HealthController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: REDIS, useValue: redis },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok for everything when Redis and Postgres answer', async () => {
    redis.ping.mockResolvedValue('PONG');
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.get()).resolves.toEqual({ api: 'ok', redis: 'ok', postgres: 'ok' });
  });

  it('returns 503 naming Redis when Redis is down', async () => {
    redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    prisma.$queryRaw.mockResolvedValue([]);

    const err = await controller.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toEqual({
      api: 'ok',
      redis: 'down',
      postgres: 'ok',
    });
  });

  it('returns 503 naming Postgres when Postgres is down', async () => {
    redis.ping.mockResolvedValue('PONG');
    prisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    const err = await controller.get().catch((e: unknown) => e);
    expect((err as ServiceUnavailableException).getResponse()).toEqual({
      api: 'ok',
      redis: 'ok',
      postgres: 'down',
    });
  });

  it('treats a hanging dependency as down instead of waiting forever', async () => {
    jest.useFakeTimers();
    redis.ping.mockReturnValue(new Promise(() => {})); // never settles
    prisma.$queryRaw.mockResolvedValue([]);

    const result = controller.get().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(1000);
    const err = await result;
    jest.useRealTimers();

    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ redis: 'down' });
  });
});
