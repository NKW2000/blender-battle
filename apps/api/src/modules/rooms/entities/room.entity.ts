import { Difficulty, RoomStatus, RoomVisibility } from '@bb/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Category } from '@/modules/challenges/entities/category.entity';
import { Challenge } from '@/modules/challenges/entities/challenge.entity';
import { User } from '@/modules/users/entities/user.entity';

import { RoomParticipant } from './room-participant.entity';

/**
 * A room: several artists, one brief, one deadline.
 *
 * Replaces the 1v1 duel. The important structural difference is that a room has
 * no sides — every participant stands alone and is ranked by likes — so nothing
 * here mirrors the old `votes_a` / `votes_b` shape.
 *
 * The challenge is deliberately nullable until the room starts. The host chooses
 * only the *filters*; the server draws the actual brief at kickoff and reveals it
 * to everyone in the same broadcast. If the host picked it, they would know the
 * brief before anyone joined and could arrive with the model already built,
 * which is the one thing a timed modelling contest cannot survive.
 *
 * All deadlines are absolute timestamps owned by the server, never durations
 * counted down by a client.
 */
@Entity('rooms')
@Index('idx_rooms_status', ['status'])
@Index('idx_rooms_visibility_status', ['visibility', 'status'])
export class Room extends BaseEntity {
  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'enum', enum: RoomVisibility, default: RoomVisibility.PUBLIC })
  visibility: RoomVisibility;

  /**
   * Join code for private rooms; null for public ones.
   *
   * Unique so a code can be looked up directly, and the only way into a private
   * room — private rooms are excluded from every listing query.
   */
  @Index('idx_rooms_code', { unique: true, where: '"join_code" IS NOT NULL' })
  @Column({ type: 'varchar', length: 12, name: 'join_code', nullable: true })
  joinCode: string | null;

  @Column({ type: 'enum', enum: RoomStatus, default: RoomStatus.LOBBY })
  status: RoomStatus;

  @Column({ type: 'uuid', name: 'host_id' })
  hostId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'host_id' })
  host: User;

  // --- What the host asked for, not what they get -----------------------------

  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({ type: 'enum', enum: Difficulty, nullable: true })
  difficulty: Difficulty | null;

  /** Drawn by the server at kickoff. Null while the room is still in the lobby. */
  @Column({ type: 'uuid', name: 'challenge_id', nullable: true })
  challengeId: string | null;

  @ManyToOne(() => Challenge, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'challenge_id' })
  challenge: Challenge | null;

  // --- Shape and clocks -------------------------------------------------------

  @Column({ type: 'integer', name: 'max_players', default: 8 })
  maxPlayers: number;

  @Column({ type: 'integer', name: 'duration_seconds', default: 1800 })
  durationSeconds: number;

  /** When modelling opens. Set at kickoff, after the reveal. */
  @Column({ type: 'timestamptz', name: 'starts_at', nullable: true })
  startsAt: Date | null;

  /** Upload deadline. Anyone without a submission at this moment is eliminated. */
  @Column({ type: 'timestamptz', name: 'ends_at', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'timestamptz', name: 'voting_ends_at', nullable: true })
  votingEndsAt: Date | null;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;

  /**
   * Whether results count toward XP and the leaderboard.
   *
   * Decided when voting opens, from the visibility and the number of real
   * submissions — not from anything the host set. Stored rather than recomputed
   * so a room's history cannot change meaning if the threshold is ever retuned.
   */
  @Column({ type: 'boolean', name: 'is_ranked', default: false })
  isRanked: boolean;

  @OneToMany(() => RoomParticipant, (participant) => participant.room, {
    cascade: ['insert'],
  })
  participants: RoomParticipant[];

  /** The deadline governing the current phase, or null once finished. */
  get phaseEndsAt(): Date | null {
    switch (this.status) {
      case RoomStatus.DRAWING:
        return this.startsAt;
      case RoomStatus.ACTIVE:
        return this.endsAt;
      case RoomStatus.VOTING:
      case RoomStatus.RUNOFF:
        return this.votingEndsAt;
      default:
        return null;
    }
  }
}
