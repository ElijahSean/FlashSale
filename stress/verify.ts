// Reconciliation check (requirement 07): after a stress run, do Redis and Postgres agree, and was
// anything oversold or lost? Prints each check and PASS or FAIL; exits 1 on FAIL.
//
//   npm run verify
//
// Reads the stack published by `npm run stress:up` (Redis and Postgres on 127.0.0.1), using the
// REDIS_URL and DATABASE_URL in the root .env. Run by Node directly (type stripping, no build).
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';

// Copies of the contracts in apps/api/src/sale/sale.keys.ts and purchase/order-queue.ts.
const KEYS = { config: 'sale:config', stock: 'sale:stock', buyers: 'sale:buyers' };
const ORDERS_QUEUE = 'orders';

// The worker saves orders a few milliseconds behind the API. Wait up to this long for it.
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
      // A failed job is a buyer the worker gave up on: a unit sold with no order.
      { name: 'no failed jobs', ok: failed === 0, detail: `${failed} in the failed set` },
      // Rule 1: stock can never go below zero.
      { name: 'stock is not negative', ok: stock >= 0, detail: `stock ${stock}` },
      // Every unit is either still in stock or held by exactly one buyer: nothing oversold, nothing
      // lost (rule 6).
      {
        name: 'stock + buyers = initial stock',
        ok: stock + buyers.size === initialStock,
        detail: `${stock} + ${buyers.size} vs ${initialStock}`,
      },
      // Rule 2, both guards agree: each Redis buyer has its one Postgres order.
      {
        name: 'every buyer has an order',
        ok: missingOrders.length === 0,
        detail: `${missingOrders.length} missing, e.g. ${missingOrders.slice(0, 3).join(', ')}`,
      },
      // And no order exists for a unit that was given back (the gap noted in LEARNINGS 04).
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

/** Polls until no job is waiting, active or delayed, or the timeout passes. Returns what is left. */
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
