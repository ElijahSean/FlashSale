import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { OrderQueue } from '../purchase/order-queue';
import { REDIS } from '../redis/redis.module';
import type { SaleConfig } from '../sale/sale-config';
import { SALE_CONFIG } from '../sale/sale-seed.service';
import { SALE_KEYS } from '../sale/sale.keys';
import type { ResetDto } from './reset.dto';

// nest-cli.json copies the .lua files next to the compiled code, as for the purchase scripts.
const RESET_SCRIPT = readFileSync(join(__dirname, 'lua', 'reset.lua'), 'utf8');

export interface ResetResult {
  stock: number;
  startsAt: string;
  endsAt: string;
}

/**
 * Puts the sale back to a clean start between stress runs: no jobs, no orders, full stock, no
 * buyers. Meant for a quiet system; a purchase running at the same moment may survive the reset.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly orders: OrderQueue,
    @Inject(SALE_CONFIG) private readonly config: SaleConfig,
  ) {}

  async reset(dto: ResetDto): Promise<ResetResult> {
    const stock = dto.stock ?? this.config.initialStock;
    const window =
      dto.startsInSeconds !== undefined && dto.durationSeconds !== undefined
        ? ['relative', dto.startsInSeconds * 1000, dto.durationSeconds * 1000]
        : ['absolute', this.config.startsAt, this.config.endsAt];

    try {
      // Order matters. The queue goes first, so no waiting job writes an order after the table is
      // emptied. Obliterate also removes completed jobs: they keep their jobId for a day, and a
      // rerun with the same user names would otherwise be ignored as duplicates (rule 5).
      await this.orders.queue.obliterate({ force: true });
      await this.prisma.$executeRaw`TRUNCATE orders`;
      // Last: stock and buyers, in one atomic script (rule 1).
      const [startsAt, endsAt] = (await this.redis.eval(
        RESET_SCRIPT,
        3,
        SALE_KEYS.config,
        SALE_KEYS.stock,
        SALE_KEYS.buyers,
        stock,
        ...window,
      )) as [string, string];

      const result = {
        stock,
        startsAt: new Date(Number(startsAt)).toISOString(),
        endsAt: new Date(Number(endsAt)).toISOString(),
      };
      this.logger.warn(`Sale reset: ${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      // Rule 4 applies here too: a half-done reset is reported as a failure, never as success.
      this.logger.error(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException('Reset failed');
    }
  }
}
