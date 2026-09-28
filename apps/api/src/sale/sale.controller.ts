import { Controller, Get } from '@nestjs/common';
import { SaleService, SaleView } from './sale.service';

// Public: no login needed to see the product and sale status. Served as GET /api/sale.
@Controller('sale')
export class SaleController {
  constructor(private readonly sale: SaleService) {}

  @Get()
  get(): Promise<SaleView> {
    return this.sale.getSale();
  }
}
