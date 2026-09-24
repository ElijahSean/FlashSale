import { Controller, Get } from '@nestjs/common';
import { SaleService, SaleView } from './sale.service';

// Public on purpose: no AuthGuard. Anyone can see the product and whether the sale is live.
// Served as GET /api/sale through the global "api" prefix (see app.setup.ts).
@Controller('sale')
export class SaleController {
  constructor(private readonly sale: SaleService) {}

  @Get()
  get(): Promise<SaleView> {
    return this.sale.getSale();
  }
}
