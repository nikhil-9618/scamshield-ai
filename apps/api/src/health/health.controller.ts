import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../common/security/auth-user';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async liveness() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Public readiness intentionally omits provider configuration details. */
  @Public()
  @Get('ready')
  async readiness() {
    return this.health.summary();
  }
}
