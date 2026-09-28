import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { computeStatus, SaleStatus } from './sale-status';
import { SALE_KEYS } from './sale.keys';

// Rule 7: this 1 s cache is the only sale data the API keeps in memory.
// Short enough to stay fresh, long enough to absorb a burst of page refreshes.
export const CACHE_TTL_MS = 1_000;

/** What Redis holds, read in one round trip. */
interface Snapshot {
  startsAt: number;
  endsAt: number;
  initialStock: number;
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
  // Starting stock, so the page can show "42 of 100 left".
  initialStock: number;
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
    // Only the Redis read is cached. Status and time are worked out fresh on every request.
    const now = Date.now();
    return {
      product: { name: s.productName, price: s.productPrice, imageUrl: s.productImageUrl },
      status: computeStatus(s, s.stock, now),
      startsAt: new Date(s.startsAt).toISOString(),
      endsAt: new Date(s.endsAt).toISOString(),
      initialStock: s.initialStock,
      stockRemaining: Math.max(0, s.stock),
      serverTime: new Date(now).toISOString(),
    };
  }

  /**
   * Cached snapshot, read once even when many requests arrive together ("single-flight").
   *
   * With a plain cache, every request that comes in while the cache is being refilled
   * would also read Redis. Here they all share the one read already in progress.
   *
   * A failed read is not cached, so the next request tries again.
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
      // MULTI: config and stock from the same moment, in one round trip.
      results = await this.redis.multi().hgetall(SALE_KEYS.config).get(SALE_KEYS.stock).exec();
    } catch {
      // Rule 4: Redis down or slow means 503, never a guess.
      throw new ServiceUnavailableException('Sale state is unavailable');
    }

    const [configReply, stockReply] = results ?? [];
    const config = configReply?.[1] as Record<string, string> | undefined;
    const stock = stockReply?.[1] as string | null | undefined;
    if (configReply?.[0] || stockReply?.[0] || !config?.startsAt || stock == null) {
      // Keys missing: the sale was reset while running. Restarting the API seeds it again.
      throw new ServiceUnavailableException('Sale is not configured');
    }

    return {
      startsAt: Number(config.startsAt),
      endsAt: Number(config.endsAt),
      initialStock: Number(config.initialStock),
      stock: Number(stock),
      productName: config.productName,
      productPrice: config.productPrice,
      productImageUrl: config.productImageUrl ?? '',
    };
  }
}
