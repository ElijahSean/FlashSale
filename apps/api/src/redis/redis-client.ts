import Redis from 'ioredis';

/**
 * Builds the API's Redis client. Tests use it too, so they get the real settings.
 *
 * Why these settings (rule 4, fail closed):
 * - enableOfflineQueue: false. Normally ioredis saves commands while disconnected and sends
 *   them later. A purchase could then hang and succeed minutes later. We want an error now (503).
 * - commandTimeout: a stuck Redis fails fast too.
 * - maxRetriesPerRequest: 1. No silent retries.
 * Reconnecting stays on, so the API recovers by itself when Redis is back.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    enableOfflineQueue: false,
    commandTimeout: 500,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
  });
}

// How long startup waits for Redis. In Docker the API restarts if this fails, so failing is safe.
const READY_TIMEOUT_MS = 10_000;

/**
 * Waits until the client is connected. Without the offline queue, an early command would fail,
 * so startup work (seeding, loading scripts) waits here. Gives a clear error if Redis never comes.
 */
export async function waitForRedisReady(redis: Redis, timeoutMs = READY_TIMEOUT_MS) {
  if (redis.status === 'ready') return;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      redis.off('ready', onReady);
      reject(new Error(`Redis not reachable within ${timeoutMs / 1000} s. Is it running?`));
    }, timeoutMs);
    redis.once('ready', onReady);
  });
}
