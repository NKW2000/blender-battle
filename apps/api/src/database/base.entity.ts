import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * UUID primary keys, not bigserial: battle/challenge identifiers appear in URLs and
 * WebSocket payloads, and sequential integers leak volume and allow enumeration.
 * They also let Phase 5 features (tournaments, teams) merge rows across shards or
 * environments without key collisions.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
