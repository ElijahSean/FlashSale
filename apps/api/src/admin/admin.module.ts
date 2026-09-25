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
 * The admin routes exist only when ENABLE_ADMIN is exactly "true". Otherwise the module is never
 * loaded, so /api/admin/reset is a plain 404: nothing there to guess a token for.
 *
 * A function, not the string form registerWhen(AdminModule, 'ENABLE_ADMIN'): that form counts a
 * missing variable as on (it only checks the value is not "false"). Off must be the default.
 */
export const adminModule = () =>
  ConditionalModule.registerWhen(AdminModule, (env) => env.ENABLE_ADMIN === 'true');
