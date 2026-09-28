import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * The worker's database client. Made from the API's schema, so both agree on the orders table.
 * Connects on the first query.
 */
export function createPrisma(databaseUrl: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** The one thing saveOrder needs. Tests pass a fake to simulate a broken database. */
export type OrderWriter = Pick<PrismaClient, '$executeRaw'>;
