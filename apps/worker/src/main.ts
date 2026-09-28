import { resolve } from 'node:path';
import { config } from 'dotenv';
import Redis from 'ioredis';
import { createPrisma } from './prisma';
import { startOrderWorker } from './worker';

// Same root .env as the API. In Docker there is no .env; settings come from Compose.
config({ path: resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env at the repo root.`);
  return value;
}

async function main() {
  // Unlike the API, the worker is patient: it waits out a Redis outage and carries on.
  // No buyer is waiting on it.
  const connection = new Redis(required('REDIS_URL'), { maxRetriesPerRequest: null });
  const prisma = createPrisma(required('DATABASE_URL'));
  const worker = startOrderWorker({ connection, db: prisma, redis: connection });

  worker.on('ready', () => console.log('Worker ready, consuming the orders queue'));
  worker.on('completed', (job, result) => console.log(`Order ${job.data.userId}: ${result}`));
  worker.on('failed', (job, err) => {
    const tries = `${job?.attemptsMade}/${job?.opts.attempts ?? 1}`;
    // Prisma puts the real cause on the last line of its message. Log just that line.
    const reason = err.message.trim().split('\n').pop();
    console.error(`Order ${job?.data.userId} failed (try ${tries}): ${reason}`);
  });
  // Connection problems: log only. BullMQ reconnects by itself.
  worker.on('error', (err) => console.error(`Worker error: ${err.message}`));

  // Clean shutdown: stop taking jobs and finish the running ones, so no insert is cut in half.
  // After a crash, the job runs again, and the safe insert makes that fine (rule 5).
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
