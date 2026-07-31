import {
  ChallengeStatus,
  ChallengeVisibility,
  Difficulty,
} from '@bb/shared';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { Category } from './category.entity';
import { ChallengeAsset } from './challenge-asset.entity';
import { Tag } from './tag.entity';

/**
 * A challenge is the unit two players are given at the start of a battle.
 *
 * Rows are never hard-deleted: Phase 3 battles reference the challenge they were
 * fought over, and a battle whose challenge vanished cannot be replayed, judged,
 * or explained. "Delete" is a soft delete, and the ordinary retirement path is
 * ARCHIVED — still readable in history, never drawn again.
 */
@Entity('challenges')
// The draw and browse path: published + public, filtered by category/difficulty.
// Partial index because unpublished rows are never eligible for either.
@Index('idx_challenges_draw', ['status', 'visibility', 'categoryId', 'difficulty'])
@Index('idx_challenges_author', ['createdById', 'status'])
export class Challenge extends BaseEntity {
  @Column({ type: 'citext', unique: true })
  slug: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: Difficulty })
  difficulty: Difficulty;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.challenges, {
    // Categories in use cannot be deleted; the alternative is orphaning every
    // challenge that referenced one.
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @ManyToMany(() => Tag, (tag) => tag.challenges, { cascade: ['insert'] })
  @JoinTable({
    name: 'challenge_tags',
    joinColumn: { name: 'challenge_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @Column({ type: 'integer', name: 'estimated_minutes' })
  estimatedMinutes: number;

  /** e.g. "4.2". Free text: managers target whatever version the brief needs. */
  @Column({ type: 'text', name: 'blender_version', nullable: true })
  blenderVersion: string | null;

  @Column({ type: 'text', nullable: true })
  rules: string | null;

  /** Ordered checklist shown during the battle. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  objectives: string[];

  @Column({ type: 'text', name: 'allowed_assets', nullable: true })
  allowedAssets: string | null;

  @Column({ type: 'text', name: 'forbidden_assets', nullable: true })
  forbiddenAssets: string | null;

  @Column({ type: 'integer', name: 'reward_xp' })
  rewardXp: number;

  @Column({ type: 'enum', enum: ChallengeStatus, default: ChallengeStatus.DRAFT })
  status: ChallengeStatus;

  @Column({
    type: 'enum',
    enum: ChallengeVisibility,
    default: ChallengeVisibility.PUBLIC,
  })
  visibility: ChallengeVisibility;

  @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
  publishedAt: Date | null;

  /**
   * Open and close times for a public, everyone-enters challenge.
   *
   * Both null on an ordinary challenge, which is drawn into rooms and has no
   * calendar of its own. When they are set the challenge becomes an event: entry
   * is open to anyone between the two dates, uploads close on `endDate`, and
   * voting for a winner opens after it.
   *
   * Absolute timestamps owned by the server, never a duration counted down by a
   * client — the close time decides whether an upload is accepted at all.
   */
  @Column({ type: 'timestamptz', name: 'start_date', nullable: true })
  startDate: Date | null;

  @Column({ type: 'timestamptz', name: 'end_date', nullable: true })
  endDate: Date | null;

  /**
   * When voting closes and the winner is frozen.
   *
   * Null means voting stays open until a manager closes it by hand. When set,
   * the scheduler declares the winner the moment it passes — so an organiser can
   * schedule the whole event, submission window and vote window both, in advance.
   */
  @Column({ type: 'timestamptz', name: 'voting_ends_at', nullable: true })
  votingEndsAt: Date | null;

  /** Set once voting has resolved, so a finished event stops re-tallying. */
  @Column({ type: 'uuid', name: 'winner_entry_id', nullable: true })
  winnerEntryId: string | null;

  @Column({ type: 'uuid', name: 'created_by_id' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @OneToMany(() => ChallengeAsset, (asset) => asset.challenge, { cascade: true })
  assets: ChallengeAsset[];

  /**
   * Denormalised counter for Phase 4's "most-played challenge" metric. Kept here
   * rather than counted from battles on every dashboard load.
   */
  @Column({ type: 'integer', name: 'times_played', default: 0 })
  timesPlayed: number;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  /** Eligible for a random draw. The single definition both the service and the
   *  detail endpoint check against, so the two cannot disagree. */
  get isDrawable(): boolean {
    return (
      this.status === ChallengeStatus.PUBLISHED &&
      this.visibility === ChallengeVisibility.PUBLIC &&
      this.deletedAt === null
    );
  }
}
