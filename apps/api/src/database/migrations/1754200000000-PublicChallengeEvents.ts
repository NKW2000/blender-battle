import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public, dated challenges: entry and vote tables, plus the event window on the
 * challenge itself.
 *
 * The date columns are nullable because most challenges are not events — they
 * are drawn into rooms and have no calendar. A challenge becomes public and
 * dated only when both are set.
 */
export class PublicChallengeEvents1754200000000 implements MigrationInterface {
  name = 'PublicChallengeEvents1754200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenges"
        ADD COLUMN "start_date" timestamptz,
        ADD COLUMN "end_date" timestamptz,
        ADD COLUMN "winner_entry_id" uuid
    `);

    // Partial: only event challenges carry dates, and the index exists to find
    // the ones currently open rather than to scan the whole catalogue.
    await queryRunner.query(`
      CREATE INDEX "idx_challenges_event_window"
        ON "challenges" ("start_date", "end_date")
        WHERE "start_date" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "challenge_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "image_url" text NOT NULL,
        "model_url" text,
        "model_filename" varchar(255),
        "notes" text,
        "submitted_at" timestamptz NOT NULL DEFAULT now(),
        "vote_count" integer NOT NULL DEFAULT 0,
        "is_hidden" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_challenge_entry" UNIQUE ("challenge_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_challenge_entries_challenge" ON "challenge_entries" ("challenge_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "challenge_votes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "challenge_id" uuid NOT NULL REFERENCES "challenges"("id") ON DELETE CASCADE,
        "entry_id" uuid NOT NULL REFERENCES "challenge_entries"("id") ON DELETE CASCADE,
        "voter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        -- One vote per person per challenge, for exactly one entry. Keyed on the
        -- challenge, not the entry, or a voter could back every entry at once.
        CONSTRAINT "uq_challenge_vote" UNIQUE ("challenge_id", "voter_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_challenge_votes_entry" ON "challenge_votes" ("entry_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_entries"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_challenges_event_window"`);
    await queryRunner.query(`
      ALTER TABLE "challenges"
        DROP COLUMN IF EXISTS "start_date",
        DROP COLUMN IF EXISTS "end_date",
        DROP COLUMN IF EXISTS "winner_entry_id"
    `);
  }
}
