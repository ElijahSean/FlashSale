import { ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_TTL_MS, SaleService } from './sale.service';

const START = Date.parse('2026-10-01T10:00:00Z');
const END = Date.parse('2026-10-01T11:00:00Z');

// A stand-in for ioredis that answers multi().hgetall().get().exec() and counts round trips.
function fakeRedis(stock = '5') {
  const state = { reads: 0, fail: false };
  const client = {
    multi: () => {
      const chain = {
        hgetall: () => chain,
        get: () => chain,
        exec: async () => {
          state.reads++;
          if (state.fail) throw new Error('Connection is closed.');
          return [
            [
              null,
              {
                startsAt: String(START),
                endsAt: String(END),
                initialStock: '10',
                productName: 'Sneaker',
                productPrice: '$99.00',
                productImageUrl: '/images/product.jpg',
              },
            ],
            [null, stock],
          ];
        },
      };
      return chain;
    },
  };
  return { redis: client as unknown as Redis, state };
}

describe('SaleService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START + 60_000);
  });
  afterEach(() => jest.useRealTimers());

  it('builds the view from Redis with fresh server time', async () => {
    const { redis } = fakeRedis();
    const view = await new SaleService(redis).getSale();
    expect(view).toEqual({
      product: { name: 'Sneaker', price: '$99.00', imageUrl: '/images/product.jpg' },
      status: 'active',
      startsAt: '2026-10-01T10:00:00.000Z',
      endsAt: '2026-10-01T11:00:00.000Z',
      stockRemaining: 5,
      serverTime: new Date(START + 60_000).toISOString(),
    });
  });

  it('reports sold out when stock is 0', async () => {
    const { redis } = fakeRedis('0');
    expect((await new SaleService(redis).getSale()).status).toBe('sold_out');
  });

  it('serves 1,000 parallel requests with one Redis read (single-flight)', async () => {
    const { redis, state } = fakeRedis();
    const service = new SaleService(redis);
    await Promise.all(Array.from({ length: 1_000 }, () => service.getSale()));
    expect(state.reads).toBe(1);
  });

  it('reads Redis again once the 1 s cache expires', async () => {
    const { redis, state } = fakeRedis();
    const service = new SaleService(redis);
    await service.getSale();
    jest.advanceTimersByTime(CACHE_TTL_MS - 1);
    await service.getSale();
    expect(state.reads).toBe(1);
    jest.advanceTimersByTime(1);
    await service.getSale();
    expect(state.reads).toBe(2);
  });

  it('keeps serverTime current even when the snapshot is cached', async () => {
    const { redis } = fakeRedis();
    const service = new SaleService(redis);
    await service.getSale();
    jest.advanceTimersByTime(500);
    expect((await service.getSale()).serverTime).toBe(new Date(START + 60_500).toISOString());
  });

  it('answers 503 when Redis fails, and does not cache the failure (rule 4)', async () => {
    const { redis, state } = fakeRedis();
    const service = new SaleService(redis);
    state.fail = true;
    await expect(service.getSale()).rejects.toBeInstanceOf(ServiceUnavailableException);
    state.fail = false;
    await expect(service.getSale()).resolves.toMatchObject({ status: 'active' });
    expect(state.reads).toBe(2);
  });
});
