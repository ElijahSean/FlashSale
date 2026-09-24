import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * The worker's Prisma client. Generated from the API's schema (apps/api/prisma/schema.prisma), so
 * both apps always agree on the orders table. Like the API, it talks to Postgres through the
 * node-postgres driver adapter and opens its pool on the first query.
 */
export function createPrisma(databaseUrl: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** The one thing saveOrder needs from Prisma. Tests pass a stand-in to simulate a failing database. */
export type OrderWriter = Pick<PrismaClient, '$executeRaw'>;
