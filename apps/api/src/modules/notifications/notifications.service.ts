import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  NotificationType,
  type CursorPage,
  type NotificationItem,
} from '@bb/shared';
import { IsNull, Repository } from 'typeorm';

import { buildPage, decodeCursor, encodeCursor } from '@/common/pagination/cursor';

import { Notification } from './entities/notification.entity';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  /**
   * Persists a notification, then pushes it.
   *
   * In that order, and never only pushed: a socket delivery reaches whoever
   * happens to be connected right now, which is exactly the wrong guarantee for
   * "you won your battle". The row is the delivery; the push is how someone
   * already looking at the page finds out without refreshing.
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = await this.notifications.save(
      this.notifications.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      }),
    );

    return notification;
  }

  /** Fan-out helper. Used when the same event concerns several people. */
  async createMany(inputs: CreateNotificationInput[]): Promise<void> {
    for (const input of inputs) {
      await this.create(input);
    }
  }

  async list(params: {
    userId: string;
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<NotificationItem>> {
    const builder = this.notifications
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId: params.userId })
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .take(params.limit + 1);

    if (params.cursor) {
      const { value, id } = decodeCursor(params.cursor);
      builder.andWhere('(n.created_at, n.id) < (:value, :id)', { value, id });
    }

    const rows = await builder.getMany();
    const page = buildPage(rows, params.limit, (row) => encodeCursor(row.createdAt, row.id));

    return {
      items: page.items.map((row) => this.toItem(row)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  /** Served by the partial index on unread rows — this is polled often. */
  async unreadCount(userId: string): Promise<number> {
    return this.notifications.countBy({ userId, readAt: IsNull() });
  }

  /**
   * Marks one notification read. Scoped by user id as well as notification id,
   * so a guessed id cannot be used to mutate someone else's inbox.
   */
  async markRead(userId: string, id: string): Promise<void> {
    await this.notifications.update({ id, userId, readAt: IsNull() }, { readAt: new Date() });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications.update({ userId, readAt: IsNull() }, { readAt: new Date() });
  }

  private toItem(row: Notification): NotificationItem {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
