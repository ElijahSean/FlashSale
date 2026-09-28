import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { waitForRedisReady } from '../redis/redis-client';
import { REDIS } from '../redis/redis.module';
// "import type" because SaleConfig only exists at compile time (TypeScript error TS1272 otherwise).
import type { SaleConfig } from './sale-config';
import { SALE_KEYS } from './sale.keys';

export const SALE_CONFIG = Symbol('SALE_CONFIG');

/**
 * Writes the sale into Redis at startup, but only keys that don't exist yet.
 *
 * Why: a restart or a second API copy must never reset stock that was already sold.
 * HSETNX and SET ... NX mean "set only if missing". Nothing is read then written back,
 * so rule 1 holds: stock is created here, but only the Lua gate changes it.
 *
 * MULTI sends them together. If two API copies start at once, the first creates the keys
 * and the second changes nothing.
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

  /** True if this call created the stock (the first start). */
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

    // Last reply is the SET NX: "OK" if created, null if it already existed.
    const stockReply = results?.at(-1);
    if (!stockReply || stockReply[0]) throw stockReply?.[0] ?? new Error('Sale seed was aborted');
    return stockReply[1] === 'OK';
  }
}
