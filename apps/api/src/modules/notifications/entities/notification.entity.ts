import { NotificationType } from '@bb/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One thing worth telling a user about.
 *
 * Stored rather than pushed-and-forgotten: a player who was offline when their
 * battle resolved still needs to learn they won. The socket push is an
 * optimisation on top of the row, never the delivery mechanism itself.
 *
 * `link` is an in-app path, never an external URL — a notification is rendered
 * as a clickable row, and storing arbitrary URLs here would turn any code path
 * that creates one into an open-redirect.
 */
@Entity('notifications')
// The inbox query: this user's notifications, newest first.
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'text', nullable: true })
  link: string | null;

  /** Null while unread. Also the partial-index predicate for the badge count. */
  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
