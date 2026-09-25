import helmet from '@fastify/helmet';
import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
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

/** The HTTP server settings that must exist before the app is created. */
export function createAdapter() {
  return new FastifyAdapter({ bodyLimit: BODY_LIMIT_BYTES });
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
}
