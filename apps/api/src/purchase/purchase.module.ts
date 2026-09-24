import { Module } from '@nestjs/common';
import { PurchaseService } from './purchase.service';

// No controller yet: the purchase endpoint and AuthGuard arrive in 05. The module is registered
// now so the scripts are loaded into Redis at startup.
@Module({
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
