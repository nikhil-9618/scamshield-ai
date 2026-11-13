import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  adminReportUpdateSchema,
  adminUserUpdateSchema,
  paginationSchema,
  reportListQuerySchema,
  type AdminReportUpdateInput,
  type PaginationInput,
} from '@scamshield/validation';
import { z } from 'zod';
import { AdminService } from './admin.service';
import { CurrentUser, Roles, type AuthUser } from '../common/security/auth-user';
import { zodPipe } from '../common/pipes/zod-validation.pipe';

const createThreatSchema = z.object({
  domain: z.string().trim().min(3).max(300),
  category: z.string().trim().min(2).max(60),
  riskLevel: z.enum(['moderate', 'high', 'critical']),
  note: z.string().trim().max(500).optional(),
});

@ApiTags('admin')
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'Platform aggregates, provider health and abuse counters' })
  async analytics() {
    return this.admin.analytics();
  }

  @Get('users')
  async users(@Query(zodPipe(paginationSchema)) query: PaginationInput, @Query('q') q?: string) {
    return this.admin.users((q ?? '').slice(0, 120), query.page, query.pageSize);
  }

  @Patch('users/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Assign roles or suspend an account (guards against removing the last admin)' })
  async updateUser(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(zodPipe(adminUserUpdateSchema)) body: { roles?: string[]; suspended?: boolean },
    @Req() request: Request,
  ) {
    return this.admin.updateUser(actor.id, id, body, request);
  }

  @Get('reports')
  @Roles('admin', 'moderator')
  async reports(@Query(zodPipe(reportListQuerySchema)) query: Parameters<AdminService['reportsList']>[0] & PaginationInput) {
    return this.admin.reportsList(query, query.page, query.pageSize);
  }

  @Patch('reports/:id')
  @Roles('admin', 'moderator')
  @HttpCode(200)
  async updateReport(
    @CurrentUser() moderator: AuthUser,
    @Param('id') id: string,
    @Body(zodPipe(adminReportUpdateSchema)) body: AdminReportUpdateInput,
    @Req() request: Request,
  ) {
    return this.admin.reportUpdate(id, moderator.id, body, request);
  }

  @Get('system-health')
  async systemHealth() {
    return this.admin.systemHealth();
  }

  @Get('providers')
  async providers() {
    return this.admin.providers();
  }

  @Get('audit-logs')
  async auditLogs(@Query(zodPipe(paginationSchema)) query: PaginationInput, @Query('action') action?: string) {
    return this.admin.auditLogs(query.page, query.pageSize, action?.slice(0, 80));
  }

  @Get('threats')
  async threats(@Query(zodPipe(paginationSchema)) query: PaginationInput) {
    return this.admin.threats(query.page, query.pageSize);
  }

  @Post('threats')
  @HttpCode(201)
  @ApiOperation({ summary: 'Manually add a verified threat domain' })
  async createThreat(
    @CurrentUser() actor: AuthUser,
    @Body(zodPipe(createThreatSchema)) body: { domain: string; category: string; riskLevel: 'moderate' | 'high' | 'critical'; note?: string },
    @Req() request: Request,
  ) {
    return this.admin.createThreat(actor.id, body, request);
  }
}
