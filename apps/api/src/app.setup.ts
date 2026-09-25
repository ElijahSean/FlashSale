import helmet from '@fastify/helmet';
import { Logger, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

// Every request body in this API is tiny (the largest is a login with a 254-character userId).
// Anything bigger is refused with 413 before it is parsed, so nobody can make us parse megabytes.
const BODY_LIMIT_BYTES = 1024;

/**
 * whitelist: fields not declared in a DTO are dropped, so extra input never reaches the code.
 * transform: the handler gets the DTO instance, with the DTO's @Transform (normalization) applied.
 */
export const VALIDATION_OPTIONS: ValidationPipeOptions = { whitelist: true, transform: true };

/**
 * The HTTP server settings that must exist before the app is created.
 *
 * trustProxy (requirement 07): behind nginx every request comes from nginx's address, so the per-IP
 * rate limit would count all users as one. With it set, Fastify takes req.ip from the
 * X-Forwarded-For header, but only when the request arrives from an address on the list. nginx
 * overwrites that header with the real client address, so a client cannot fake its IP.
 * The value is a proxy-addr list, such as "uniquelocal" (the private ranges Docker networks use).
 * Empty means off: in development nothing sits in front of the API, and the header is ignored.
 */
export function createAdapter({ trustProxy = '' }: { trustProxy?: string } = {}) {
  return new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: trustProxy || false,
    // By default Fastify answers 503 to a request that arrives while it is shutting down. The
    // queue and the database close only after the HTTP server has stopped (see OrderQueue), so
    // such a request can still be served. Found in the failover test (07): one 503 per stop.
    return503OnClosing: false,
  });
}

/**
 * App-wide HTTP settings, shared by main.ts and the integration tests so both serve the same
 * routes with the same protections.
 *
 * Every feature route lives under /api (sale, auth, purchase). /health stays at the root because
 * Docker healthchecks and nginx (07) probe it directly.
 */
export async function configureApp(app: NestFastifyApplication) {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Standard security headers on every response (nosniff, frame blocking, HSTS, and others).
  await app.register(helmet);

  // Browsers may call the API only from the web app. A list, not a single string: with a string
  // the header always names our origin; with a list it is sent only when the caller matches.
  app.enableCors({ origin: [config.getOrThrow<string>('WEB_ORIGIN')] });

  app.useGlobalPipes(new ValidationPipe(VALIDATION_OPTIONS));

  // One line per request, such as "POST /api/purchases 201 3ms". In Docker, `docker compose logs`
  // prefixes each line with the container name, which shows both API replicas taking traffic (07).
  // Off by default: nobody needs it in development or in the tests. /health is skipped: Docker
  // probes it every few seconds, and those lines would bury the real traffic.
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
