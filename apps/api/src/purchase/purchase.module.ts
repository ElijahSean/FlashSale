import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderQueue } from './order-queue';
import { PurchaseStatusService } from './purchase-status.service';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

@Module({
  imports: [AuthModule], // for AuthGuard
  controllers: [PurchaseController],
  providers: [OrderQueue, PurchaseService, PurchaseStatusService],
  exports: [PurchaseService, OrderQueue], // the admin reset empties OrderQueue
})
export class PurchaseModule {}
