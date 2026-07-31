import { ActivityAction } from '@bb/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only audit trail. Serves both the admin "activity" view and the security
 * log, distinguished by the action namespace (`security.*` vs everything else).
 *
 * Does not extend BaseEntity: there is no `updated_at` on an immutable record, and
 * pretending there is invites someone to write an UPDATE against it.
 */
@Entity('activity_logs')
@Index('idx_activity_logs_actor_created', ['actorId', 'createdAt'])
@Index('idx_activity_logs_action_created', ['action', 'createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null for anonymous events such as a failed login against an unknown account. */
  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId: string | null;

  @Column({ type: 'enum', enum: ActivityAction })
  action: ActivityAction;

  /** Loose reference, intentionally not an FK: the target row may be hard-deleted. */
  @Column({ type: 'text', name: 'entity_type', nullable: true })
  entityType: string | null;

  @Column({ type: 'uuid', name: 'entity_id', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  /**
   * Also the pagination cursor key and the future partition key — this table grows
   * without bound and will be range-partitioned by month once volume warrants it.
   */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
