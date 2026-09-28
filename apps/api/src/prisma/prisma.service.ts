import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 talks to Postgres through the "pg" driver.
 * It connects on the first query, so the API starts even if Postgres is down (/health shows it).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    });
  }

  // Closed after the HTTP server stops (like the queue), so last requests still have a database.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
