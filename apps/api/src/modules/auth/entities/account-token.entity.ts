import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { User } from '@/modules/users/entities/user.entity';

export enum AccountTokenPurpose {
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFICATION = 'email_verification',
}

/**
 * A single-use, expiring secret emailed to an account's address.
 *
 * Both purposes share this table because they are the same object with
 * different copy. Two tables would mean two chances to get the single-use
 * guarantee or the expiry subtly different, on the two flows where getting it
 * wrong is worst.
 *
 * Not a `BaseEntity`: there is no soft delete here on purpose. A revoked or
 * spent token must be gone or visibly spent, never a row that still matches a
 * lookup while carrying a `deleted_at`.
 */
@Entity('account_tokens')
@Index('idx_account_tokens_user_purpose', ['userId', 'purpose'])
export class AccountToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: AccountTokenPurpose })
  purpose: AccountTokenPurpose;

  /** SHA-256 of the emailed token. The token itself is never stored. */
  @Column({ type: 'char', length: 64, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /**
   * Set on redemption; the row survives.
   *
   * Keeping a spent token lets a replay be answered as "this link has already
   * been used" rather than "no such link", which is the difference between a
   * user who tries the newer email and one who assumes the system is broken.
   */
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  get isExpired(): boolean {
    return this.expiresAt.getTime() <= Date.now();
  }
}
