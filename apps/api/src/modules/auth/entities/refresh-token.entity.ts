import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { RefreshTokenFamily } from './refresh-token-family.entity';

/**
 * One row per issued refresh token. Rotation marks the old row `usedAt` and links
 * `replacedById` to the new one, giving a verifiable chain per session.
 *
 * Only the SHA-256 hash is stored. A database dump therefore cannot be replayed
 * against the API — the same reasoning that applies to passwords applies here,
 * because a refresh token is a long-lived bearer credential.
 */
@Entity('refresh_tokens')
@Index('idx_refresh_tokens_family', ['familyId'])
export class RefreshToken extends BaseEntity {
  @Column({ type: 'uuid', name: 'family_id' })
  familyId: string;

  @ManyToOne(() => RefreshTokenFamily, (family) => family.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family: RefreshTokenFamily;

  @Column({ type: 'char', length: 64, name: 'token_hash', unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** Non-null once rotated. Presenting a token whose `usedAt` is set means theft. */
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'uuid', name: 'replaced_by_id', nullable: true })
  replacedById: string | null;

  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  get isExpired(): boolean {
    return this.expiresAt.getTime() <= Date.now();
  }
}
