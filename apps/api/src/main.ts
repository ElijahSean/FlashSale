import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp, createAdapter } from './app.setup';

async function bootstrap() {
  // Fastify instead of Express: less work per request, which matters in a flash sale.
  // TRUST_PROXY comes from Docker's environment. .env isn't loaded yet at this point.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createAdapter({ trustProxy: process.env.TRUST_PROXY }),
  );
  await configureApp(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 so nginx can reach the API from another container.
  // backlog: how many new connections can wait in line. Node's default is 511.
  // In a flash sale thousands arrive at once; extra ones are dropped and retried a second later.
  await app.listen({ port, host: '0.0.0.0', backlog: 4096 });
  console.log(`API listening on port ${port} (FastifyAdapter)`);
}

void bootstrap();
