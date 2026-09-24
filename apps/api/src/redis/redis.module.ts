import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

/**
 * One shared ioredis client for the whole API process.
 *
 * Why these options (design rule 4, fail closed):
 * - enableOfflineQueue: false. By default ioredis buffers commands while disconnected and
 *   sends them when Redis comes back. For a purchase that would mean a request hangs, then
 *   maybe succeeds minutes later. We want an immediate error so the API can answer 503.
 * - commandTimeout: a connected but stuck Redis also fails fast instead of holding the request.
 * - maxRetriesPerRequest: 1. A command is not silently retried many times.
 * Reconnection itself stays on (default retryStrategy), so the API recovers on its own
 * once Redis is back.
 *
 * The client connects in the background. At startup the sale seeder (02) waits up to 10 s for
 * it and stops the API if Redis never comes up. Once running, a Redis outage does not crash
 * the process: /health reports it and requests get 503 until Redis is back.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          enableOfflineQueue: false,
          commandTimeout: 500,
          connectTimeout: 1000,
          maxRetriesPerRequest: 1,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
