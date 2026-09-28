import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SaleModule } from './sale/sale.module';
import { AuthModule } from './auth/auth.module';
import { PurchaseModule } from './purchase/purchase.module';
import { adminModule } from './admin/admin.module';

@Module({
  imports: [
    // Reads the .env at the repo root. In Docker there is no .env; settings come from Compose.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: resolve(__dirname, '../../../.env') }),
    RedisModule,
    PrismaModule,
    HealthModule,
    SaleModule,
    AuthModule,
    PurchaseModule,
    // Test-only reset route, only when ENABLE_ADMIN=true.
    adminModule(),
  ],
})
export class AppModule {}
