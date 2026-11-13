import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, type AuthUser } from '../common/security/auth-user';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'Real aggregates from the signed-in user’s scans (never fabricated)' })
  async analytics(@CurrentUser() user: AuthUser) {
    return this.dashboard.analytics(user.id);
  }
}
