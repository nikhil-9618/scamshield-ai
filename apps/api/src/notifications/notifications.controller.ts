import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationSchema, type PaginationInput } from '@scamshield/validation';
import { NotificationsService } from './notifications.service';
import { CurrentUser, type AuthUser } from '../common/security/auth-user';
import { zodPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query(zodPipe(paginationSchema)) query: PaginationInput) {
    return this.notifications.list(user.id, query.page, query.pageSize);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAll(@CurrentUser() user: AuthUser) {
    return { updated: await this.notifications.markAllRead(user.id) };
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.notifications.markRead(user.id, id);
  }

  @Post('test')
  @HttpCode(201)
  async createTest(@CurrentUser() user: AuthUser, @Body() body: { title?: string; message?: string }) {
    await this.notifications.create(user.id, {
      type: 'system',
      title: body.title?.slice(0, 80) ?? 'Test notification',
      body: body.message?.slice(0, 300) ?? 'This is a test of your in-app notification settings.',
    });
    return { created: true };
  }
}
