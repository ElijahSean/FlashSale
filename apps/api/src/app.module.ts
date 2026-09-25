import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SaleModule } from './sale/sale.module';
import { AuthModule } from './auth/auth.module';
import { PurchaseModule } from './purchase/purchase.module';

@Module({
  imports: [
    // One .env at the repo root, shared with docker compose. In containers (07) the
    // variables come from the environment and this file is simply absent.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: resolve(__dirname, '../../../.env') }),
    RedisModule,
    PrismaModule,
    HealthModule,
    SaleModule,
    AuthModule,
    PurchaseModule,
  ],
})
export class AppModule {}
