import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderQueue } from './order-queue';
import { PurchaseStatusService } from './purchase-status.service';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

@Module({
  imports: [AuthModule], // AuthGuard and the JwtService it verifies with
  controllers: [PurchaseController],
  providers: [OrderQueue, PurchaseService, PurchaseStatusService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
