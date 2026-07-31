import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { CursorPage, NotificationItem } from '@bb/shared';

import { CurrentUser } from '@/common/decorators';
import { CursorQueryDto } from '@/common/dto/cursor-query.dto';

import { NotificationsService } from './notifications.service';

/** Every route is implicitly scoped to the caller — there is no "read anyone's inbox". */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: CursorQueryDto,
  ): Promise<CursorPage<NotificationItem>> {
    return this.notifications.list({ userId, cursor: query.cursor, limit: query.limit });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser('id') userId: string): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser('id') userId: string): Promise<void> {
    await this.notifications.markAllRead(userId);
  }
}
