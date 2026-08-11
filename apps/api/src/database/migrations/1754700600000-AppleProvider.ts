import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `apple` to the OAuth provider enum.
 *
 * Discord is deliberately *not* removed from the type. Postgres cannot drop a
 * value from an enum, so removing it means creating a new type, rewriting every
 * column that uses it and dropping the old one — a table rewrite to delete a
 * word. Worse, any `oauth_identities` row already recorded as `discord` would
 * have nowhere to go: those rows are how their owners sign in, and a migration
 * that strips them is a migration that locks people out.
 *
 * So the value stays in the database and leaves the application. `OAuthProvider`
 * no longer offers it, the buttons no longer render it, and the service no
 * longer knows how to talk to it — existing rows keep referring to a value the
 * type still accepts, which is exactly the property that makes them safe.
 */
export class AppleProvider1754700600000 implements MigrationInterface {
  name = 'AppleProvider1754700600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
      `IF NOT EXISTS` because this is not transactional in the usual sense —
      before Postgres 12 `ALTER TYPE ... ADD VALUE` could not run inside a
      transaction block at all, and a half-applied migration re-running would
      otherwise fail on the duplicate rather than continue.
    */
    await queryRunner.query(`ALTER TYPE "oauth_provider_enum" ADD VALUE IF NOT EXISTS 'apple'`);
  }

  /**
   * Irreversible, and says so.
   *
   * Postgres offers no `ALTER TYPE ... DROP VALUE`. Reversing this means
   * recreating the type without `apple`, which fails outright if any identity
   * row uses it — and if none does, the value is harmless where it is. Throwing
   * beats a `down` that silently does nothing and reports success.
   */
  public async down(): Promise<void> {
    throw new Error(
      'AppleProvider is not reversible: Postgres cannot remove a value from an enum type.',
    );
  }
}
