import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { waitForRedisReady } from '../redis/redis-client';
import { REDIS } from '../redis/redis.module';
import { SALE_KEYS } from '../sale/sale.keys';
import { OrderQueue } from './order-queue';

export const PURCHASE_RESULTS = [
  'SUCCESS',
  'ALREADY_PURCHASED',
  'SOLD_OUT',
  'NOT_STARTED',
  'ENDED',
] as const;
export type PurchaseResult = (typeof PURCHASE_RESULTS)[number];

/** A Lua script and its SHA (the id Redis gives it). */
interface Script {
  name: string;
  source: string;
  sha?: string;
}

// Read once at startup. The build copies the .lua files next to the code.
const readScript = (file: string) => readFileSync(join(__dirname, 'lua', file), 'utf8');

/**
 * Runs the purchase gate and the undo script in Redis.
 *
 * SCRIPT LOAD sends a script once and gets back a SHA (a short id).
 * EVALSHA then runs it by that id, so each purchase sends a few bytes, not the whole script.
 * If Redis forgot the script (restart), EVALSHA says NOSCRIPT. We load it again and retry once.
 * That retry is safe: NOSCRIPT means the script did not run.
 *
 * Any other error becomes 503 (rule 4, fail closed).
 * Nothing but the script ever decides a purchase (rule 3).
 */
@Injectable()
export class PurchaseService implements OnModuleInit {
  private readonly logger = new Logger(PurchaseService.name);
  private readonly purchaseScript: Script = {
    name: 'purchase',
    source: readScript('purchase.lua'),
  };
  private readonly releaseScript: Script = { name: 'release', source: readScript('release.lua') };

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly orders: OrderQueue,
  ) {}

  // Load both scripts at startup, so the first buyer doesn't wait for it.
  async onModuleInit() {
    await waitForRedisReady(this.redis);
    await Promise.all([this.load(this.purchaseScript), this.load(this.releaseScript)]);
  }

  /**
   * The full purchase: reserve in Redis, then queue the order for the worker.
   *
   * Rule 6, no lost stock: if queueing fails, give the unit back, then answer 503.
   * Otherwise the unit would be stuck: reserved, but never an order.
   *
   * ALREADY_PURCHASED queues again. Usually that does nothing (the job exists, rule 5).
   * But if an earlier try timed out after reserving, this creates the missing job.
   */
  async purchase(userId: string): Promise<PurchaseResult> {
    const result = await this.attempt(userId);

    if (result === 'SUCCESS') {
      try {
        await this.orders.enqueue(userId);
      } catch (err) {
        this.logger.error(`Enqueue failed for a new reservation, releasing it: ${errMsg(err)}`);
        // If Redis is down, this fails too (503). The user's next try goes down the
        // ALREADY_PURCHASED path below, which queues the missing job.
        await this.release(userId);
        throw new ServiceUnavailableException('Purchase is temporarily unavailable');
      }
    } else if (result === 'ALREADY_PURCHASED') {
      try {
        await this.orders.enqueue(userId);
      } catch (err) {
        // Never give the unit back here: this user may already have an order.
        this.logger.error(`Re-enqueue failed for an existing buyer: ${errMsg(err)}`);
        throw new ServiceUnavailableException('Purchase is temporarily unavailable');
      }
    }
    return result;
  }

  /** Tries to reserve one unit. Only the Lua script decides (rule 3). */
  async attempt(userId: string): Promise<PurchaseResult> {
    const result = await this.run(
      this.purchaseScript,
      [SALE_KEYS.config, SALE_KEYS.stock, SALE_KEYS.buyers],
      [userId],
    );
    if (!PURCHASE_RESULTS.includes(result as PurchaseResult)) {
      throw new Error(`Unexpected purchase script result: ${String(result)}`);
    }
    return result as PurchaseResult;
  }

  /**
   * Undoes a reservation (rule 6). Returns true if a unit was given back.
   * Safe to call twice: stock only goes up if the buyer was really removed.
   */
  async release(userId: string): Promise<boolean> {
    const result = await this.run(
      this.releaseScript,
      [SALE_KEYS.stock, SALE_KEYS.buyers],
      [userId],
    );
    return result === 1;
  }

  private async load(script: Script) {
    script.sha = (await this.redis.script('LOAD', script.source)) as string;
  }

  private async run(script: Script, keys: string[], args: string[]): Promise<unknown> {
    try {
      if (!script.sha) await this.load(script);
      try {
        return await this.redis.evalsha(script.sha!, keys.length, ...keys, ...args);
      } catch (err) {
        if (!(err instanceof Error) || !err.message.startsWith('NOSCRIPT')) throw err;
        this.logger.warn(`Script "${script.name}" missing from Redis cache, reloading`);
        await this.load(script);
        return await this.redis.evalsha(script.sha!, keys.length, ...keys, ...args);
      }
    } catch (err) {
      // Rule 4, fail closed: we don't know what happened, so we never guess.
      this.logger.error(`Script "${script.name}" failed: ${errMsg(err)}`);
      throw new ServiceUnavailableException('Purchase is temporarily unavailable');
    }
  }
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
