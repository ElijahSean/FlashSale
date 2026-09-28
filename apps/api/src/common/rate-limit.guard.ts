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
 * Limits requests per second, per IP and per user. Over the limit: 429, and the route never runs.
 * So a flood of clicks never reaches the Lua script.
 *
 * How it counts (a "fixed window"):
 * - Each request adds 1 to a key like ratelimit:user:alice (INCR).
 * - A new key gets a 1 s lifetime (PEXPIRE ... NX), so the count resets every second.
 * - Both commands go in one MULTI: one round trip, applied together.
 * - A caller can get up to twice the limit across a second boundary. Fine for stopping floods.
 *
 * Counters live in Redis, not memory, so the limit holds across all API copies (rule 7).
 * Redis down: 503 (rule 4). The purchase would fail anyway.
 *
 * Use after AuthGuard. With no user (demo login), only the IP limit applies.
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
    // From env, so stress tests can raise them.
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
      // Replies come in pairs (INCR, PEXPIRE). The counts are the INCR replies.
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
