import { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * App-wide HTTP settings, shared by main.ts and the integration tests so both serve the same
 * routes.
 *
 * Every feature route lives under /api (sale, auth, purchase). /health stays at the root because
 * Docker healthchecks and nginx (07) probe it directly.
 */
export function configureApp(app: NestFastifyApplication) {
  app.setGlobalPrefix('api', { exclude: ['health'] });
}
