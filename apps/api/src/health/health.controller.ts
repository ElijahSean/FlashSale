import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // 503 if anything is down, so Docker marks this copy unhealthy. The body says what failed.
  @Get()
  async get() {
    const report = await this.health.check();
    if (report.redis === 'down' || report.postgres === 'down') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
