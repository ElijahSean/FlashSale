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
      // Parsed once at startup. A bad .env throws here and the API does not start.
      provide: SALE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => parseSaleConfig((key) => config.get<string>(key)),
    },
    SaleSeedService,
    SaleService,
  ],
})
export class SaleModule {}
