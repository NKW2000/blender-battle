import { BattleResult, RoomParticipantStatus } from '@bb/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { Room } from './room.entity';
import { Submission } from './submission.entity';

/**
 * One artist in one room.
 *
 * The unique constraint is the real guard against joining twice under a race —
 * two simultaneous join requests both pass an application-level "are they in
 * already?" check, and only the database can actually reject the second.
 */
@Entity('room_participants')
@Unique('uq_room_participant', ['roomId', 'userId'])
@Index('idx_room_participants_user', ['userId'])
export class RoomParticipant extends BaseEntity {
  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, (room) => room.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: RoomParticipantStatus,
    default: RoomParticipantStatus.ENTERED,
  })
  status: RoomParticipantStatus;

  @OneToOne(() => Submission, (submission) => submission.participant)
  submission: Submission | null;

  // --- Result, written once when the room completes ---------------------------

  /**
   * Likes received across the main ballot.
   *
   * Denormalised onto the participant so ranking is one indexed read rather than
   * a COUNT over the likes table per entry, which would be run for every viewer
   * of every finished room.
   */
  @Column({ type: 'integer', name: 'like_count', default: 0 })
  likeCount: number;

  /** Picks received in the runoff, if one was needed. Null when it was not. */
  @Column({ type: 'integer', name: 'runoff_votes', nullable: true })
  runoffVotes: number | null;

  /** 1-based, assigned at completion. Null for eliminated entries. */
  @Column({ type: 'integer', nullable: true })
  placement: number | null;

  @Column({ type: 'enum', enum: BattleResult, nullable: true })
  result: BattleResult | null;

  @Column({ type: 'integer', name: 'xp_awarded', default: 0 })
  xpAwarded: number;
}
