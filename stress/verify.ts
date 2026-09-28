// After a stress run: do Redis and Postgres agree? Was anything oversold or lost?
// Prints each check, then PASS or FAIL (exit code 1).
//
//   npm run verify
//
// Uses REDIS_URL and DATABASE_URL from the root .env. Node runs this .ts file directly.
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';

// Copied from the API (sale.keys.ts and order-queue.ts).
const KEYS = { config: 'sale:config', stock: 'sale:stock', buyers: 'sale:buyers' };
const ORDERS_QUEUE = 'orders';

// The worker saves orders a moment after the API. Wait up to this long.
const DRAIN_TIMEOUT_MS = 60_000;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function main() {
  process.loadEnvFile('.env');
  const redis = new Redis(required('REDIS_URL'), { maxRetriesPerRequest: 1 });
  const db = new pg.Client({ connectionString: required('DATABASE_URL') });
  const queue = new Queue(ORDERS_QUEUE, { connection: redis });

  try {
    await db.connect();
    const pending = await waitForDrain(queue);
    const { failed = 0 } = await queue.getJobCounts('failed');

    const initialStock = Number(await redis.hget(KEYS.config, 'initialStock'));
    const stock = Number(await redis.get(KEYS.stock));
    const buyers = new Set(await redis.smembers(KEYS.buyers));
    const { rows } = await db.query<{ userId: string }>('SELECT "userId" FROM orders');
    const orders = new Set(rows.map((r) => r.userId));

    const missingOrders = [...buyers].filter((u) => !orders.has(u));
    const ordersWithoutBuyer = [...orders].filter((u) => !buyers.has(u));

    const checks: Check[] = [
      { name: 'queue drained', ok: pending === 0, detail: `${pending} jobs still pending` },
      // A failed job means a unit sold with no order.
      { name: 'no failed jobs', ok: failed === 0, detail: `${failed} in the failed set` },
      // Rule 1: stock never below zero.
      { name: 'stock is not negative', ok: stock >= 0, detail: `stock ${stock}` },
      // Every unit is either in stock or held by one buyer: nothing oversold or lost (rule 6).
      {
        name: 'stock + buyers = initial stock',
        ok: stock + buyers.size === initialStock,
        detail: `${stock} + ${buyers.size} vs ${initialStock}`,
      },
      // Rule 2: every Redis buyer has its Postgres order.
      {
        name: 'every buyer has an order',
        ok: missingOrders.length === 0,
        detail: `${missingOrders.length} missing, e.g. ${missingOrders.slice(0, 3).join(', ')}`,
      },
      // And no order exists for a unit that was given back.
      {
        name: 'every order has a buyer',
        ok: ordersWithoutBuyer.length === 0,
        detail: `${ordersWithoutBuyer.length} extra, e.g. ${ordersWithoutBuyer.slice(0, 3).join(', ')}`,
      },
    ];

    console.log(
      `initial stock ${initialStock}, stock left ${stock}, buyers ${buyers.size}, orders ${orders.size}`,
    );
    for (const c of checks)
      console.log(`${c.ok ? '  ok  ' : ' FAIL '} ${c.name}${c.ok ? '' : `: ${c.detail}`}`);
    const pass = checks.every((c) => c.ok);
    console.log(pass ? 'PASS' : 'FAIL');
    process.exitCode = pass ? 0 : 1;
  } finally {
    await queue.close();
    await redis.quit();
    await db.end();
  }
}

/** Waits until the queue is empty or time runs out. Returns how many jobs are left. */
async function waitForDrain(queue: Queue): Promise<number> {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  for (;;) {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    const pending = Object.values(counts).reduce((a, b) => a + b, 0);
    if (pending === 0 || Date.now() > deadline) return pending;
    console.log(`waiting for the worker: ${pending} jobs pending`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env at the repo root.`);
  return value;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  console.log('FAIL');
  process.exitCode = 1;
});
