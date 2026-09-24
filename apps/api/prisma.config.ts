import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads .env by itself. Load the shared root .env explicitly.
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
