import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres here) instead of a
 * bundled binary engine. No eager $connect: the pool opens on first query, so the API
 * boots even when Postgres is down and /health reports it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
