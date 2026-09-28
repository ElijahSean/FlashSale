import helmet from '@fastify/helmet';
import { Logger, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

// All our request bodies are tiny. Anything over 1 KB gets 413 before we read it.
const BODY_LIMIT_BYTES = 1024;

/**
 * whitelist: drop any field the DTO doesn't declare.
 * transform: apply the DTO's clean-up (like lowercasing) before the handler runs.
 */
export const VALIDATION_OPTIONS: ValidationPipeOptions = { whitelist: true, transform: true };

/**
 * HTTP server settings needed before the app is created.
 *
 * trustProxy: behind nginx, every request seems to come from nginx. The per-IP limit would then
 * count all users as one. With trustProxy, the real client IP is read from X-Forwarded-For,
 * but only if the request comes from a trusted address (like "uniquelocal", Docker's private range).
 * nginx overwrites that header, so a client can't fake its IP.
 * Empty means off (development has no nginx).
 */
export function createAdapter({ trustProxy = '' }: { trustProxy?: string } = {}) {
  return new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: trustProxy || false,
    // Fastify normally answers 503 while shutting down. We can still serve those requests:
    // the queue and database close last (see OrderQueue). Found in the failover test.
    return503OnClosing: false,
  });
}

/**
 * App-wide HTTP settings. main.ts and the tests both use this, so they behave the same.
 *
 * All routes are under /api, except /health, which Docker checks directly.
 */
export async function configureApp(app: NestFastifyApplication) {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Standard security headers on every response.
  await app.register(helmet);

  // Browsers may call the API only from our web app. A list (not a string) means the header
  // is sent only to a matching caller.
  app.enableCors({ origin: [config.getOrThrow<string>('WEB_ORIGIN')] });

  app.useGlobalPipes(new ValidationPipe(VALIDATION_OPTIONS));

  // One log line per request, like "POST /api/purchases 201 3ms". Docker logs add the container
  // name, which shows both API copies get traffic. Off by default. /health is skipped because
  // Docker calls it every few seconds.
  if (config.get<string>('LOG_REQUESTS') === 'true') {
    const logger = new Logger('HTTP');
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onResponse', async (req, reply) => {
        if (req.url === '/health') return;
        logger.log(
          `${req.method} ${req.url} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`,
        );
      });
  }
}
