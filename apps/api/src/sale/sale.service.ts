import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { computeStatus, SaleStatus } from './sale-status';
import { SALE_KEYS } from './sale.keys';

// Design rule 7: this cache is the only sale state the API keeps in memory. One second is short
// enough that the page is never meaningfully stale and long enough to absorb a refresh storm.
export const CACHE_TTL_MS = 1_000;

/** What Redis holds, read in one round trip. */
interface Snapshot {
  startsAt: number;
  endsAt: number;
  stock: number;
  productName: string;
  productPrice: string;
  productImageUrl: string;
}

export interface SaleView {
  product: { name: string; price: string; imageUrl: string };
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  stockRemaining: number;
  serverTime: string;
}

@Injectable()
export class SaleService {
  private cached?: { snapshot: Snapshot; expiresAt: number };
  private inFlight?: Promise<Snapshot>;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getSale(): Promise<SaleView> {
    const s = await this.snapshot();
    // Status and serverTime are worked out per request from the cached snapshot, so the clock
    // shown to the user is never up to a second stale. Only the Redis read is cached.
    const now = Date.now();
    return {
      product: { name: s.productName, price: s.productPrice, imageUrl: s.productImageUrl },
      status: computeStatus(s, s.stock, now),
      startsAt: new Date(s.startsAt).toISOString(),
      endsAt: new Date(s.endsAt).toISOString(),
      stockRemaining: Math.max(0, s.stock),
      serverTime: new Date(now).toISOString(),
    };
  }

  /**
   * Cached snapshot with single-flight.
   *
   * A plain TTL cache has a gap: when it expires, every request that arrives before the first
   * Redis reply also misses and reads Redis. Under a burst that is hundreds of reads. Keeping the
   * pending promise means all of them wait on the one read already in progress.
   *
   * A failed read is not cached, so the next request tries Redis again right away.
   */
  private snapshot(): Promise<Snapshot> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return Promise.resolve(this.cached.snapshot);
    }
    this.inFlight ??= this.read()
      .then((snapshot) => {
        this.cached = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
        return snapshot;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  private async read(): Promise<Snapshot> {
    let results: [Error | null, unknown][] | null;
    try {
      // MULTI so config and stock come from the same moment, in one round trip.
      results = await this.redis.multi().hgetall(SALE_KEYS.config).get(SALE_KEYS.stock).exec();
    } catch {
      // Design rule 4: Redis down or slow means 503, never a guessed answer.
      throw new ServiceUnavailableException('Sale state is unavailable');
    }

    const [configReply, stockReply] = results ?? [];
    const config = configReply?.[1] as Record<string, string> | undefined;
    const stock = stockReply?.[1] as string | null | undefined;
    if (configReply?.[0] || stockReply?.[0] || !config?.startsAt || stock == null) {
      // Keys missing means the sale was reset while the API was running. Restarting reseeds it.
      throw new ServiceUnavailableException('Sale is not configured');
    }

    return {
      startsAt: Number(config.startsAt),
      endsAt: Number(config.endsAt),
      stock: Number(stock),
      productName: config.productName,
      productPrice: config.productPrice,
      productImageUrl: config.productImageUrl ?? '',
    };
  }
}
