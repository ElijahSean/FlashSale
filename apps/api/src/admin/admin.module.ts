import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { PurchaseModule } from '../purchase/purchase.module';
import { SaleModule } from '../sale/sale.module';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [SaleModule, PurchaseModule], // SALE_CONFIG and OrderQueue
  controllers: [AdminController],
  providers: [AdminService, AdminTokenGuard],
})
export class AdminModule {}

/**
 * The admin route exists only when ENABLE_ADMIN is exactly "true". Otherwise it's a 404.
 *
 * We pass a function, not just 'ENABLE_ADMIN': the short form treats a missing variable as on.
 */
export const adminModule = () =>
  ConditionalModule.registerWhen(AdminModule, (env) => env.ENABLE_ADMIN === 'true');
