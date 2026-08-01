import { ExperienceLevel, Role, UserStatus, type SocialLinks } from '@bb/shared';
import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * The single source of truth for a player's identity AND their competitive stats.
 *
 * Stats (wins/losses/xp/score) are denormalised onto this row deliberately. The
 * leaderboard is a derived read model (Redis sorted set, rebuilt from these
 * columns) rather than a second table, because a second table is free to drift out
 * of sync with the profile page and there is no cheap way to detect that it has.
 *
 * `role` lives here rather than in a separate Managers table: a manager IS a user
 * with elevated permissions, and splitting them creates two identity records to
 * keep consistent for one human. Manager-specific *profile* data, if it ever
 * appears, belongs in a satellite table keyed by user_id — not a parallel identity.
 */
@Entity('users')
@Index('idx_users_role_status', ['role', 'status'])
// The leaderboard ordering index (score DESC, id) is created in the migration —
// TypeORM's decorator cannot express the DESC tiebreaker shape we need.
export class User extends BaseEntity {
  /** citext: case-insensitive uniqueness without a functional index on lower(). */
  @Column({ type: 'citext', unique: true })
  username: string;

  @Column({ type: 'citext', unique: true })
  email: string;

  /**
   * Never selected by default — an accidental `find()` must not carry the hash out.
   *
   * Nullable since Phase 5: an account created through Discord or Google has no
   * password at all. Such an account can only be signed into through its linked
   * provider until the owner sets one.
   */
  @Column({ type: 'text', name: 'password_hash', select: false, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.PLAYER })
  role: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  /** Set when status is SUSPENDED; a background job or guard restores access after. */
  @Column({ type: 'timestamptz', name: 'suspended_until', nullable: true })
  suspendedUntil: Date | null;

  @Column({ type: 'text', name: 'avatar_url', nullable: true })
  avatarUrl: string | null;

  /** Cloudinary public_id, kept so the old asset can be destroyed on replacement. */
  @Column({ type: 'text', name: 'avatar_public_id', nullable: true })
  avatarPublicId: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  /** ISO 3166-1 alpha-2. */
  @Column({ type: 'char', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'jsonb', name: 'social_links', default: () => "'{}'::jsonb" })
  socialLinks: SocialLinks;

  /**
   * Ordered ids of the entries the artist has pinned to their profile showcase.
   *
   * A plain ordered id array rather than a join table: order matters, the list
   * is short (capped at ten), and it is read as a whole every time — the same
   * reasoning that keeps `social_links` a jsonb blob rather than its own table.
   * Referential integrity is enforced in the service, not by a foreign key,
   * because an entry that is later hidden or removed should simply drop out of
   * the showcase rather than block the write.
   */
  @Column({ type: 'uuid', name: 'showcase_entry_ids', array: true, default: () => "'{}'" })
  showcaseEntryIds: string[];

  @Column({
    type: 'enum',
    enum: ExperienceLevel,
    name: 'experience_level',
    default: ExperienceLevel.BEGINNER,
  })
  experienceLevel: ExperienceLevel;

  // --- Competitive statistics (authoritative; leaderboard is derived from these) ---

  @Column({ type: 'integer', name: 'total_xp', default: 0 })
  totalXp: number;

  @Column({ type: 'integer', default: 0 })
  score: number;

  @Column({ type: 'integer', default: 0 })
  wins: number;

  @Column({ type: 'integer', default: 0 })
  losses: number;

  @Column({ type: 'integer', default: 0 })
  draws: number;

  @Column({ type: 'integer', name: 'total_battles', default: 0 })
  totalBattles: number;

  @Column({ type: 'integer', name: 'current_streak', default: 0 })
  currentStreak: number;

  @Column({ type: 'integer', name: 'highest_streak', default: 0 })
  highestStreak: number;

  @Column({ type: 'integer', name: 'total_votes_received', default: 0 })
  totalVotesReceived: number;

  /**
   * Phase 2 introduces the categories table; this FK is added by that phase's
   * migration. Declared nullable now so adding it later is additive, not destructive.
   */
  @Column({ type: 'uuid', name: 'favorite_category_id', nullable: true })
  favoriteCategoryId: string | null;

  /**
   * Reserved for Phase 5 teams/organisations. Nullable from day one so the
   * relation can be introduced without rewriting the table under load.
   */
  @Column({ type: 'uuid', name: 'org_id', nullable: true })
  orgId: string | null;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  /**
   * Soft delete. Admins must be able to restore an account, and battle history
   * would lose its participants if rows were physically removed.
   */
  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  get winRate(): number {
    if (this.totalBattles === 0) return 0;
    return Math.round((this.wins / this.totalBattles) * 10000) / 100;
  }
}
