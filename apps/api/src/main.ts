import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp, createAdapter } from './app.setup';

async function bootstrap() {
  // Fastify instead of the default Express adapter: lower per-request overhead,
  // which is where a flash sale spends its time.
  // Read from the real environment (set by Compose), not from .env: the adapter is built before
  // ConfigModule loads that file. Development leaves it unset, so no proxy is trusted.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createAdapter({ trustProxy: process.env.TRUST_PROXY }),
  );
  await configureApp(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 so nginx can reach the API from another container (requirement 07).
  // backlog: how many new connections may wait for the process to accept them. Node's default is
  // 511. In a flash sale thousands arrive in the same instant; past the limit the kernel drops
  // them and the caller only retries a second later. The container's somaxconn (4096) caps it.
  await app.listen({ port, host: '0.0.0.0', backlog: 4096 });
  console.log(`API listening on port ${port} (FastifyAdapter)`);
}

void bootstrap();
