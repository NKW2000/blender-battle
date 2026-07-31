import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

import { Challenge } from './challenge.entity';
import { ChallengeEntry } from './challenge-entry.entity';

/**
 * One vote for the winner of a public challenge.
 *
 * The unique key is on `(challenge, voter)` rather than `(entry, voter)`, and
 * that is the entire rule: one vote per person per challenge, for exactly one
 * entry. Keying it on the entry instead would let a voter back every entry in
 * the event, which is not a vote for a winner.
 *
 * Changing your mind updates the same row, so moving a vote can never leave two
 * behind.
 */
@Entity('challenge_votes')
@Unique('uq_challenge_vote', ['challengeId', 'voterId'])
@Index('idx_challenge_votes_entry', ['entryId'])
export class ChallengeVote extends BaseEntity {
  @Column({ type: 'uuid', name: 'challenge_id' })
  challengeId: string;

  @ManyToOne(() => Challenge, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challenge_id' })
  challenge: Challenge;

  @Column({ type: 'uuid', name: 'entry_id' })
  entryId: string;

  @ManyToOne(() => ChallengeEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry: ChallengeEntry;

  @Column({ type: 'uuid', name: 'voter_id' })
  voterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: User;
}
