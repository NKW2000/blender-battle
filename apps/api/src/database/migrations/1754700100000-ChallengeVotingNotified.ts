import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks when entrants were told a challenge had moved into voting.
 *
 * A public challenge's phase is derived from its dates rather than stored,
 * which is the right design — it needs no scheduler to stay honest and cannot
 * drift out of step with the timestamps that define it. But it leaves nowhere
 * to hang a side effect: "voting opened" is not an event that happens once, it
 * is a condition that becomes true and stays true, so a sweep looking for
 * challenges in the voting phase would find the same ones on every tick and
 * notify their entrants every ten seconds forever.
 *
 * One nullable timestamp turns that condition into an event exactly once. It
 * records a delivery rather than a state, which is why it belongs here and not
 * in the phase derivation.
 */
export class ChallengeVotingNotified1754700100000 implements MigrationInterface {
  name = 'ChallengeVotingNotified1754700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "challenges" ADD COLUMN "voting_notified_at" timestamptz`,
    );

    /*
      Backfill every challenge that is already past its submission deadline.

      Without this, deploying would notify the entrants of every historical
      event that ever reached voting — including ones finished months ago — in
      a single sweep. A backfill that marks them as already delivered is the
      difference between shipping a feature and shipping a mass mailing.
    */
    await queryRunner.query(`
      UPDATE "challenges"
      SET "voting_notified_at" = now()
      WHERE "end_date" IS NOT NULL AND "end_date" <= now()
    `);

    // Partial index: the sweep only ever looks for rows where this is null, and
    // that set shrinks to nothing as events are processed.
    await queryRunner.query(`
      CREATE INDEX "idx_challenges_voting_unnotified"
        ON "challenges" ("end_date")
        WHERE "voting_notified_at" IS NULL AND "end_date" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_challenges_voting_unnotified"`);
    await queryRunner.query(
      `ALTER TABLE "challenges" DROP COLUMN IF EXISTS "voting_notified_at"`,
    );
  }
}
