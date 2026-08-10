import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Password reset and email verification.
 *
 * Neither existed. A forgotten password destroyed an account outright, and an
 * address was never checked, so "one vote per account" was only ever worth as
 * much as an inbox.
 *
 * One table serves both, keyed by purpose. They are the same object — a
 * single-use, expiring, hashed secret sent to an address — and splitting them
 * would mean two identical tables, two sets of indexes and two chances to get
 * the expiry or the single-use guarantee subtly different between them.
 */
export class AccountRecovery1754700400000 implements MigrationInterface {
  name = 'AccountRecovery1754700400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "account_token_purpose_enum" AS ENUM ('password_reset', 'email_verification')`,
    );

    await queryRunner.query(`
      CREATE TABLE "account_tokens" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    uuid NOT NULL,
        "purpose"    "account_token_purpose_enum" NOT NULL,
        -- SHA-256 of the token, never the token. A database dump must not be
        -- replayable against the reset endpoint; the same reasoning as
        -- refresh_tokens.token_hash.
        "token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        -- Set on redemption. The row is kept rather than deleted so a second
        -- use is distinguishable from an unknown token.
        "used_at"    timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_account_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // The lookup path: a presented token is hashed and matched exactly once.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_account_tokens_hash" ON "account_tokens" ("token_hash")`,
    );

    // Used when issuing, to invalidate any outstanding token of the same
    // purpose — asking for a second reset link must retire the first.
    await queryRunner.query(`
      CREATE INDEX "idx_account_tokens_user_purpose"
        ON "account_tokens" ("user_id", "purpose")
        WHERE "used_at" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamptz`,
    );

    /*
      Existing accounts are treated as verified.

      They registered when no verification existed, so they never had the
      opportunity to complete it. Marking them unverified would retroactively
      lock people out of a product they were already using, to enforce a rule
      that did not exist when they joined.
    */
    await queryRunner.query(`UPDATE "users" SET "email_verified_at" = "created_at"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_tokens"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "account_token_purpose_enum"`);
  }
}
