import { resolve } from 'node:path';
import { config } from 'dotenv';
import Redis from 'ioredis';
import { createPrisma } from './prisma';
import { startOrderWorker } from './worker';

// Same shared root .env as the API. In containers (07) the variables come from the environment
// and this file is simply absent.
config({ path: resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env at the repo root.`);
  return value;
}

async function main() {
  // Unlike the API, the worker is patient on purpose: maxRetriesPerRequest null and the offline
  // queue on mean it waits through a Redis outage and carries on. Nobody is waiting on it.
  const connection = new Redis(required('REDIS_URL'), { maxRetriesPerRequest: null });
  const prisma = createPrisma(required('DATABASE_URL'));
  const worker = startOrderWorker({ connection, db: prisma, redis: connection });

  worker.on('ready', () => console.log('Worker ready, consuming the orders queue'));
  worker.on('completed', (job, result) => console.log(`Order ${job.data.userId}: ${result}`));
  worker.on('failed', (job, err) => {
    const tries = `${job?.attemptsMade}/${job?.opts.attempts ?? 1}`;
    // Prisma puts the cause ("Can't reach database server ...") on the last line of a long
    // message. Log that line; the full message stays on the job as its failedReason.
    const reason = err.message.trim().split('\n').pop();
    console.error(`Order ${job?.data.userId} failed (try ${tries}): ${reason}`);
  });
  // Connection problems. Logged, not fatal: BullMQ reconnects on its own.
  worker.on('error', (err) => console.error(`Worker error: ${err.message}`));

  // Graceful shutdown: close() stops taking new jobs and waits for the ones in progress, so a
  // deploy or `docker compose stop` never cuts an insert in half. A job that was cut anyway
  // (a crash) is picked up again later, and the idempotent insert makes that safe (rule 5).
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received, finishing current jobs`);
    await worker.close();
    await prisma.$disconnect();
    await connection.quit();
    console.log('Worker stopped');
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
