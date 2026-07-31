import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { Room } from './room.entity';
import { Submission } from './submission.entity';

/**
 * One voter's like on one entry.
 *
 * The unique constraint is the whole integrity model for voting: it is what
 * makes a like idempotent and stops the same voter inflating an entry by
 * replaying the request. Application-level checking is not enough — two
 * concurrent requests both read "not liked yet" and both insert.
 *
 * Self-votes are rejected in the service *and* excluded when the ballot is
 * built. Hiding your own entry in the UI is a courtesy; refusing the write is
 * the actual rule.
 *
 * Rows are kept rather than deleted on unlike, with `active` toggled instead, so
 * the ballot remains an audit trail — a result that is disputed later can be
 * reconstructed, including who changed their mind.
 */
@Entity('submission_likes')
@Unique('uq_submission_like', ['submissionId', 'voterId', 'round'])
@Index('idx_submission_likes_room', ['roomId'])
export class SubmissionLike extends BaseEntity {
  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'submission_id' })
  submissionId: string;

  @ManyToOne(() => Submission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  @Column({ type: 'uuid', name: 'voter_id' })
  voterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: User;

  /**
   * 0 for the main ballot, 1 for the tie-break runoff.
   *
   * Part of the unique key so a runoff pick is a separate row from the main
   * like: the two rounds have different rules (unlimited vs one pick) and mixing
   * them would make the main ballot's likes count twice.
   */
  @Column({ type: 'integer', default: 0 })
  round: number;

  /** False once withdrawn. Only active rows count toward a tally. */
  @Column({ type: 'boolean', default: true })
  active: boolean;
}
