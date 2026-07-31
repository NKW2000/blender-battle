import { OAuthProvider } from '@bb/shared';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/users/entities/user.entity';

/**
 * A third-party identity linked to an account.
 *
 * UNIQUE (provider, provider_account_id) is the security-relevant constraint: it
 * stops one Discord account being linked to two Blender Battle accounts, which
 * would let someone sign in as either identity from a single provider login.
 *
 * The provider's access and refresh tokens are deliberately NOT stored. Nothing
 * here calls the provider's API after sign-in, so keeping long-lived third-party
 * credentials would be storing a liability with no corresponding use.
 */
@Entity('oauth_identities')
@Unique('uq_oauth_provider_account', ['provider', 'providerAccountId'])
@Index('idx_oauth_user', ['userId'])
export class OAuthIdentity extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: OAuthProvider })
  provider: OAuthProvider;

  /** The provider's own immutable user id — not the email, which can change. */
  @Column({ type: 'text', name: 'provider_account_id' })
  providerAccountId: string;

  /** Display handle at the provider, shown as "connected as …". */
  @Column({ type: 'text', nullable: true })
  handle: string | null;

  /** Email as the provider reported it, kept for audit, never trusted for login. */
  @Column({ type: 'citext', nullable: true })
  email: string | null;
}
