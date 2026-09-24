import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { waitForRedisReady } from '../redis/redis-client';
import { REDIS } from '../redis/redis.module';
// import type: SaleConfig is an interface, erased at runtime, so decorator metadata cannot
// reference it (TS1272 with isolatedModules).
import type { SaleConfig } from './sale-config';
import { SALE_KEYS } from './sale.keys';

export const SALE_CONFIG = Symbol('SALE_CONFIG');

/**
 * Writes the sale into Redis on startup, but only the keys that do not exist yet.
 *
 * Why "only if missing": a restart or a second replica must never reset stock that has already
 * been sold. HSETNX and SET ... NX are "set if not exists" commands, so each one is a single
 * atomic create. No value is read first and written back, which keeps design rule 1 intact:
 * stock is created here, but only the Lua gate (03) ever changes it.
 *
 * MULTI sends all of them as one unit, so two replicas booting at the same moment cannot
 * interleave. Whichever runs first creates the keys; the other one changes nothing.
 */
@Injectable()
export class SaleSeedService implements OnModuleInit {
  private readonly logger = new Logger(SaleSeedService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SALE_CONFIG) private readonly config: SaleConfig,
  ) {}

  async onModuleInit() {
    await waitForRedisReady(this.redis);
    const created = await this.seed();
    if (created) {
      this.logger.log(
        `Sale seeded: ${this.config.initialStock} units of "${this.config.productName}"`,
      );
    } else {
      this.logger.warn(
        'Sale keys already exist in Redis. Kept them; .env sale values are not applied until the keys are reset.',
      );
    }
  }

  /** Returns true when this call created the stock key, meaning this was the first boot. */
  async seed(): Promise<boolean> {
    const c = this.config;
    const fields: Record<string, string> = {
      startsAt: String(c.startsAt),
      endsAt: String(c.endsAt),
      initialStock: String(c.initialStock),
      productName: c.productName,
      productPrice: c.productPrice,
      productImageUrl: c.productImageUrl,
    };

    const tx = this.redis.multi();
    for (const [field, value] of Object.entries(fields)) {
      tx.hsetnx(SALE_KEYS.config, field, value);
    }
    tx.set(SALE_KEYS.stock, c.initialStock, 'NX');
    const results = await tx.exec();

    // Last reply is the SET NX: "OK" when created, null when the key already existed.
    const stockReply = results?.at(-1);
    if (!stockReply || stockReply[0]) throw stockReply?.[0] ?? new Error('Sale seed was aborted');
    return stockReply[1] === 'OK';
  }
}
