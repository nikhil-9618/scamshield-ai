import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { deleteAccountSchema, profileUpdateSchema, type ProfileUpdateInput } from '@scamshield/validation';
import { UsersService } from './users.service';
import { CurrentUser, type AuthUser } from '../common/security/auth-user';
import { zodPipe } from '../common/pipes/zod-validation.pipe';
import { loadEnv } from '../common/config/env';

const env = loadEnv();

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update display name, notification preferences and privacy preferences' })
  async update(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(profileUpdateSchema)) input: ProfileUpdateInput,
    @Req() request: Request,
  ) {
    return this.users.updateProfile(user.id, input, request);
  }

  @Get('me/activity')
  async activity(@CurrentUser() user: AuthUser) {
    return { items: await this.users.activity(user.id) };
  }

  @Get('me/sessions')
  async sessions(@CurrentUser() user: AuthUser) {
    return { items: await this.users.sessions(user.id, user.sessionId) };
  }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() request: Request) {
    await this.users.revokeSession(user.id, id, user.sessionId, request);
  }

  @Get('me/export')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Download a JSON export of profile, scans, reports and feedback' })
  async export(@CurrentUser() user: AuthUser) {
    return this.users.exportData(user.id);
  }

  @Delete('me')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete the account and personal data' })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(deleteAccountSchema)) body: { password: string; confirm: string },
    @Req() request: Request,
  ) {
    await this.users.deleteAccount(user.id, body.password, body.confirm, request);
  }
}
