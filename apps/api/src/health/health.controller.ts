import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // 503 when any dependency is down, so Docker healthchecks and nginx (requirement 07)
  // take a broken API replica out of rotation. The body still names which part failed.
  @Get()
  async get() {
    const report = await this.health.check();
    if (report.redis === 'down' || report.postgres === 'down') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
