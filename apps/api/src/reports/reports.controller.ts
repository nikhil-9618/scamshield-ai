import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  communityReportSchema,
  paginationSchema,
  type CommunityReportInput,
  type PaginationInput,
} from '@scamshield/validation';
import { ReportsService } from './reports.service';
import { CurrentUser, type AuthUser } from '../common/security/auth-user';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { ApiException } from '../common/http/api-exception';
import { loadEnv } from '../common/config/env';

const env = loadEnv();

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: env.REPORT_THROTTLE_LIMIT, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Submit a community report. Reports never auto-mark a domain as malicious.' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(communityReportSchema)) input: CommunityReportInput,
    @Req() request: Request,
  ) {
    return this.reports.create(user.id, input, request);
  }

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser, @Query(zodPipe(paginationSchema)) query: PaginationInput) {
    return this.reports.listMine(user.id, query.page, query.pageSize);
  }
}

@ApiTags('threats')
@Controller('threats')
export class ThreatsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Verified threat domains only' })
  async list(
    @Query(zodPipe(paginationSchema)) query: PaginationInput,
    @Query('q') q?: string,
  ) {
    return this.reports.threats((q ?? '').slice(0, 120), query.page, query.pageSize);
  }

  @Get('lookup')
  async lookup(@Query('domain') domain?: string) {
    if (!domain) throw ApiException.badRequest('Provide a domain to look up.', { domain: ['Required'] });
    return this.reports.lookupDomain(domain);
  }

  @Get(':domain')
  async detail(@Param('domain') domain: string) {
    return this.reports.lookupDomain(domain);
  }
}
