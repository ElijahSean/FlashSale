import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres here) instead of a
 * bundled binary engine. No eager $connect: the pool opens on first query, so the API
 * boots even when Postgres is down and /health reports it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    });
  }

  // After the HTTP server has stopped, like the queue (see OrderQueue): /me calls still in flight
  // during a shutdown finish with a working database connection.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
