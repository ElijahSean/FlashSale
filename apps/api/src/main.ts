import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  // Fastify instead of the default Express adapter: lower per-request overhead,
  // which is where a flash sale spends its time.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 so the API is reachable inside a container later (requirement 07).
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on port ${port} (FastifyAdapter)`);
}

void bootstrap();
