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

export const PURCHASE_RESULTS = [
  'SUCCESS',
  'ALREADY_PURCHASED',
  'SOLD_OUT',
  'NOT_STARTED',
  'ENDED',
] as const;
export type PurchaseResult = (typeof PURCHASE_RESULTS)[number];

/** A Lua script plus the SHA Redis gave it on SCRIPT LOAD. */
interface Script {
  name: string;
  source: string;
  sha?: string;
}

// Read once at startup. nest-cli.json copies the .lua files next to the compiled code.
const readScript = (file: string) => readFileSync(join(__dirname, 'lua', file), 'utf8');

/**
 * Calls the purchase gate and the compensating script in Redis.
 *
 * How the scripts are called: SCRIPT LOAD sends the script text once and Redis answers with its
 * SHA (a fingerprint). After that, EVALSHA runs it by SHA, so each purchase sends a few bytes
 * instead of the whole script. Redis keeps loaded scripts in a cache that can be emptied (a
 * restart, a failover, SCRIPT FLUSH). Then EVALSHA fails with NOSCRIPT, and we load it again
 * and retry once. That retry is safe: NOSCRIPT means the script did not run at all.
 *
 * Every other failure (Redis down, timeout, missing config) becomes a 503 (rule 4). There is
 * no second path that could decide a purchase without the script (rule 3).
 */
@Injectable()
export class PurchaseService implements OnModuleInit {
  private readonly logger = new Logger(PurchaseService.name);
  private readonly purchaseScript: Script = {
    name: 'purchase',
    source: readScript('purchase.lua'),
  };
  private readonly releaseScript: Script = { name: 'release', source: readScript('release.lua') };

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // Load both scripts at startup, so the first buyer does not pay for it.
  async onModuleInit() {
    await waitForRedisReady(this.redis);
    await Promise.all([this.load(this.purchaseScript), this.load(this.releaseScript)]);
  }

  /** Tries to reserve one unit for this user. The result comes only from the Lua script (rule 3). */
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
   * Undoes a reservation (rule 6). Returns true if a unit was given back. Safe to call more than
   * once: the script only adds stock back if it actually removed the buyer.
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
      // Rule 4, fail closed: we cannot know the outcome, so we never guess one.
      this.logger.error(`Script "${script.name}" failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Purchase is temporarily unavailable');
    }
  }
}
