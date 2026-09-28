import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisClient } from './redis-client';

export const REDIS = Symbol('REDIS');

/**
 * One shared Redis client for the whole API. Its settings are explained in redis-client.ts.
 *
 * At startup the API waits up to 10 s for Redis, then stops if it isn't there.
 * Once running, a Redis outage doesn't crash the API: /health reports it and requests get 503.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createRedisClient(config.getOrThrow<string>('REDIS_URL')),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    // Already closed: skip. Closing twice starts a 2 s timer that keeps the process alive.
    if (this.redis.status === 'end') return;
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
