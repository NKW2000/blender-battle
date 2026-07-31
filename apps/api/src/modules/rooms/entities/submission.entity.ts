import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { Room } from './room.entity';
import { RoomParticipant } from './room-participant.entity';

/**
 * One artist's entry: the render that goes on the ballot, plus the model file.
 *
 * The render is required because it is the only thing voting can actually show.
 * The model is required as proof the render came from a scene rather than from
 * somewhere else on the internet — it is not rendered anywhere yet, but it is
 * kept so a disputed result can be checked.
 *
 * `submittedAt` is set from the database clock, never from the client, because
 * it decides both whether the entry beat the deadline and who wins a tie.
 */
@Entity('submissions')
@Unique('uq_submission_participant', ['participantId'])
@Index('idx_submissions_room', ['roomId'])
export class Submission extends BaseEntity {
  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'participant_id' })
  participantId: string;

  @OneToOne(() => RoomParticipant, (participant) => participant.submission, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'participant_id' })
  participant: RoomParticipant;

  /**
   * Denormalised from the participant.
   *
   * Every self-vote check runs on this column, so it must be readable without
   * joining back through the participant row on each ballot step.
   */
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', name: 'image_url' })
  imageUrl: string;

  @Column({ type: 'text', name: 'model_url', nullable: true })
  modelUrl: string | null;

  /** Kept for moderation and for showing the artist what they uploaded. */
  @Column({ type: 'varchar', length: 255, name: 'model_filename', nullable: true })
  modelFilename: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', name: 'submitted_at', default: () => 'now()' })
  submittedAt: Date;

  /**
   * Hidden by a moderator.
   *
   * Public rooms accept images from anyone, so there has to be a way to pull one
   * without deleting the row and corrupting a finished room's tallies.
   */
  @Column({ type: 'boolean', name: 'is_hidden', default: false })
  isHidden: boolean;
}
