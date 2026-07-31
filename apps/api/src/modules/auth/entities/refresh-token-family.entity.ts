import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { RefreshToken } from './refresh-token.entity';

export enum TokenFamilyRevokeReason {
  LOGOUT = 'logout',
  /** A rotated-out token was presented again — assume theft, kill the lineage. */
  REUSE_DETECTED = 'reuse_detected',
  PASSWORD_CHANGED = 'password_changed',
  ADMIN_ACTION = 'admin_action',
  EXPIRED = 'expired',
}

/**
 * One family per login. Every rotation appends a token to the family, so revoking
 * the family logs out exactly that one device/session and nothing else.
 *
 * This lives in Postgres, not Redis. Redis holds a fast revocation denylist as a
 * cache, but it must not be the record: an eviction or a flushed cache would
 * silently sign every user out and — worse — destroy the audit trail that makes
 * reuse detection meaningful after the fact.
 */
@Entity('refresh_token_families')
@Index('idx_rtf_user_active', ['userId', 'revokedAt'])
export class RefreshTokenFamily extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({
    type: 'enum',
    enum: TokenFamilyRevokeReason,
    name: 'revoked_reason',
    nullable: true,
  })
  revokedReason: TokenFamilyRevokeReason | null;

  /** Coarse device fingerprint, shown in a future "active sessions" screen. */
  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @OneToMany(() => RefreshToken, (token) => token.family)
  tokens: RefreshToken[];

  get isRevoked(): boolean {
    return this.revokedAt !== null;
  }
}
