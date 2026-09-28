import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseSaleConfig } from './sale-config';
import { SALE_CONFIG, SaleSeedService } from './sale-seed.service';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';

@Module({
  controllers: [SaleController],
  providers: [
    {
      // Checked once at startup. A bad .env stops the API here.
      provide: SALE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => parseSaleConfig((key) => config.get<string>(key)),
    },
    SaleSeedService,
    SaleService,
  ],
  // The admin reset uses this to restore the .env values.
  exports: [SALE_CONFIG],
})
export class SaleModule {}
