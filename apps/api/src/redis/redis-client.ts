import Redis from 'ioredis';

/**
 * Builds the ioredis client the API uses. Tests call this too, so they run with exactly the
 * production options instead of a friendlier copy.
 *
 * Why these options (design rule 4, fail closed):
 * - enableOfflineQueue: false. By default ioredis buffers commands while disconnected and
 *   sends them when Redis comes back. For a purchase that would mean a request hangs, then
 *   maybe succeeds minutes later. We want an immediate error so the API can answer 503.
 * - commandTimeout: a connected but stuck Redis also fails fast instead of holding the request.
 * - maxRetriesPerRequest: 1. A command is not silently retried many times.
 * Reconnection itself stays on (default retryStrategy), so the API recovers on its own
 * once Redis is back.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    enableOfflineQueue: false,
    commandTimeout: 500,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
  });
}

// How long startup waits for Redis before giving up. In the full stack (07) Compose starts the
// API only after Redis is healthy and restarts it on exit, so failing here is safe.
const READY_TIMEOUT_MS = 10_000;

/**
 * Resolves once the client is connected. With no offline queue, a command sent before that
 * fails at once, so startup work (seeding in 02, script loading in 03) waits here first and
 * gives up with a clear error if Redis never comes up.
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
