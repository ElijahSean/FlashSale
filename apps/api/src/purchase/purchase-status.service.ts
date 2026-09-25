import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { SALE_KEYS } from '../sale/sale.keys';

export type MyPurchase =
  | { purchased: false }
  // reserved: the gate gave this user a unit and the order is queued, not saved yet.
  // confirmed: the worker (04) saved the order in Postgres.
  | { purchased: true; status: 'reserved' | 'confirmed' };

/** Answers GET /api/purchases/me: where is this user's purchase? */
@Injectable()
export class PurchaseStatusService {
  private readonly logger = new Logger(PurchaseStatusService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async forUser(userId: string): Promise<MyPurchase> {
    if (await this.hasSavedOrder(userId)) return { purchased: true, status: 'confirmed' };

    let reserved: number;
    try {
      reserved = await this.redis.sismember(SALE_KEYS.buyers, userId);
    } catch (err) {
      // Rule 4: without Redis we cannot say, so we do not guess.
      this.logger.error(`Buyer lookup failed: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('Service is temporarily unavailable');
    }
    return reserved ? { purchased: true, status: 'reserved' } : { purchased: false };
  }

  /**
   * A Postgres failure counts as "not saved yet" and the answer falls back to Redis. A buyer whose
   * purchase worked then sees "reserved", which is true, instead of an error that suggests trying
   * again. Postgres never decides who won (rule 3); it only says the order is written down.
   */
  private async hasSavedOrder(userId: string): Promise<boolean> {
    try {
      const order = await this.prisma.order.findUnique({ where: { userId }, select: { id: true } });
      return order !== null;
    } catch (err) {
      this.logger.warn(
        `Order lookup failed, answering from Redis: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
