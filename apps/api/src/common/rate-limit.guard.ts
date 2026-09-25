import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import type { AuthedRequest } from '../auth/auth.guard';

const WINDOW_MS = 1000;

/**
 * Caps requests per second, per IP address and (after AuthGuard) per user. Over the cap: 429,
 * and the route never runs, so a flood of clicks never reaches the Lua script.
 *
 * How it counts (a "fixed window"): each second a key such as ratelimit:user:alice starts at 0.
 * INCR adds one per request and PEXPIRE ... NX gives the key a 1 s lifetime only when it is new, so
 * the count disappears one second after the first request. Both run in one MULTI (one round trip,
 * applied together). A caller can squeeze up to twice the limit across a window boundary; that
 * is fine for a cap meant to stop floods, and simpler than a sliding window.
 *
 * The counters live in Redis, not in memory, so the cap holds across every API replica (rule 7).
 * If Redis cannot be reached the request gets 503 (rule 4): the purchase would fail anyway.
 *
 * Use it after AuthGuard: @UseGuards(AuthGuard, RateLimitGuard). Without a user (demo login) only
 * the IP limit applies.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly perUser: number;
  private readonly perIp: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService,
  ) {
    // Env settings so a k6 run (07) is not throttled by accident.
    this.perUser = readLimit(config, 'RATE_LIMIT_USER_PER_SEC', 5);
    this.perIp = readLimit(config, 'RATE_LIMIT_IP_PER_SEC', 50);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Partial<AuthedRequest>>();
    const limits: [key: string, max: number][] = [[`ratelimit:ip:${req.ip}`, this.perIp]];
    if (req.user) limits.push([`ratelimit:user:${req.user.id}`, this.perUser]);

    const counts = await this.count(limits.map(([key]) => key));
    if (counts.some((n, i) => n > limits[i][1])) {
      throw new HttpException('Too many requests, slow down', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  /** Adds one to each counter and returns the new counts. */
  private async count(keys: string[]): Promise<number[]> {
    const tx = this.redis.multi();
    for (const key of keys) tx.incr(key).pexpire(key, WINDOW_MS, 'NX');
    try {
      const replies = await tx.exec();
      if (!replies) throw new Error('transaction aborted');
      // Replies come in pairs (INCR, PEXPIRE); the counts are the INCR replies.
      return keys.map((_, i) => {
        const [err, count] = replies[i * 2];
        if (err) throw err;
        return Number(count);
      });
    } catch (err) {
      this.logger.error(`Rate limit check failed: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('Service is temporarily unavailable');
    }
  }
}

function readLimit(config: ConfigService, name: string, fallback: number): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive whole number`);
  return n;
}
