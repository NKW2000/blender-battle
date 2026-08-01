import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { Challenge } from './challenge.entity';

/**
 * One artist's entry into a public, dated challenge.
 *
 * Separate from a room `Submission` because the two are different competitions:
 * a room entry belongs to a private group with its own clock, this one belongs
 * to an open event on the calendar. Sharing a table would mean every query for
 * one had to remember to exclude the other.
 *
 * The unique constraint is what makes "one entry each" true under concurrency —
 * two simultaneous uploads both pass an application-level check, and only the
 * database can reject the second.
 */
@Entity('challenge_entries')
@Unique('uq_challenge_entry', ['challengeId', 'userId'])
@Index('idx_challenge_entries_challenge', ['challengeId'])
export class ChallengeEntry extends BaseEntity {
  @Column({ type: 'uuid', name: 'challenge_id' })
  challengeId: string;

  @ManyToOne(() => Challenge, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challenge_id' })
  challenge: Challenge;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** The final render. A 1024×1024 image the ballot and the profile both show. */
  @Column({ type: 'text', name: 'image_url' })
  imageUrl: string;

  /**
   * The workspace shot — the artist's Blender viewport, as proof of work. Also a
   * 1024×1024 image. Nullable only for entries created before this was required;
   * every new entry supplies it.
   */
  @Column({ type: 'text', name: 'workspace_photo_url', nullable: true })
  workspacePhotoUrl: string | null;

  /**
   * Legacy 3D-model columns, no longer written.
   *
   * Kept so historical entries that predate the two-image format are not lost,
   * but the entry flow no longer accepts a model — an entry is a final render
   * plus a workspace shot now.
   */
  @Column({ type: 'text', name: 'model_url', nullable: true })
  modelUrl: string | null;

  @Column({ type: 'varchar', length: 255, name: 'model_filename', nullable: true })
  modelFilename: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * From the database clock, never the client.
   *
   * It decides whether the entry beat `endDate`, so a client-supplied value
   * would be a way to submit late.
   */
  @Column({ type: 'timestamptz', name: 'submitted_at', default: () => 'now()' })
  submittedAt: Date;

  /** Denormalised tally, so a leaderboard read is not a COUNT per entry. */
  @Column({ type: 'integer', name: 'vote_count', default: 0 })
  voteCount: number;

  /** Hidden by a moderator without deleting the row and corrupting tallies. */
  @Column({ type: 'boolean', name: 'is_hidden', default: false })
  isHidden: boolean;
}
