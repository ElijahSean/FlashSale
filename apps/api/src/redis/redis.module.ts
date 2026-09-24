import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisClient } from './redis-client';

export const REDIS = Symbol('REDIS');

/**
 * One shared ioredis client for the whole API process. Its fail-closed options are explained in
 * redis-client.ts.
 *
 * The client connects in the background. At startup the sale seeder (02) and the purchase script
 * loader (03) wait up to 10 s for it and stop the API if Redis never comes up. Once running, a
 * Redis outage does not crash the process: /health reports it and requests get 503 until Redis
 * is back.
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
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
