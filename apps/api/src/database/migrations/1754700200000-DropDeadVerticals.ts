import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the matchmaking and achievements schema.
 *
 * `battles`, `battle_participants`, `votes` and `reactions` were created for a
 * realtime 1v1 duel feature; `achievements` and `user_achievements` for a badge
 * system. Neither was finished. There is no module, no controller, no endpoint
 * and no gateway for any of them, and no code path has ever inserted a row.
 *
 * Leaving them would be tidy-up work of no urgency, except for one thing: the
 * analytics layer *read* them. `metrics.service.ts` counted battles, votes and
 * reactions, so the admin dashboard did not report "no data yet" — it reported
 * a permanent structural zero, indistinguishable from a quiet week, on numbers
 * that could never move. Dead schema nothing reads is free; dead schema a
 * dashboard reports on is a lie with a chart attached. Metrics now read rooms,
 * submissions, entries and likes, which leaves these tables genuinely orphaned.
 *
 * Deliberately a new migration rather than an edit to the originals: those have
 * run in production, and rewriting history would leave any already-migrated
 * database disagreeing with the file that claims to describe it.
 *
 * Not reversible in the sense that matters. `down` recreates the structures so
 * the migration chain can be walked backwards, but the data is gone — which is
 * academic here, because there was never any.
 */
export class DropDeadVerticals1754700200000 implements MigrationInterface {
  name = 'DropDeadVerticals1754700200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Children first: votes and reactions reference battles, and
    // user_achievements references achievements.
    await queryRunner.query(`DROP TABLE IF EXISTS "reactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "battle_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "battles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_achievements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "achievements"`);

    /*
      `battle_result_enum` survives on purpose.

      It is still the type of `room_participants.result`, which has live data in
      it. The enum was created for battles and outlived them; the name is now
      slightly wrong and renaming it would be a migration that buys nothing but
      a tidier identifier.
    */
    await queryRunner.query(`DROP TYPE IF EXISTS "reactions_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "battles_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "battle_side_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "achievements_stat_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "achievements_tier_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "battles_status_enum" AS ENUM
        ('ready_check','countdown','active','voting','completed','cancelled')
    `);
    await queryRunner.query(`CREATE TYPE "battle_side_enum" AS ENUM ('a','b')`);
    await queryRunner.query(
      `CREATE TYPE "reactions_type_enum" AS ENUM ('fire','clap','mind_blown','laugh')`,
    );
    await queryRunner.query(`
      CREATE TYPE "achievements_stat_enum" AS ENUM
        ('wins','total_battles','current_streak','highest_streak','total_xp',
         'total_votes_received','score')
    `);
    await queryRunner.query(
      `CREATE TYPE "achievements_tier_enum" AS ENUM ('bronze','silver','gold')`,
    );

    /*
      Structure only.

      These are recreated so a `migration:revert` chain does not break on a
      missing dependency, not because anything can use them again — the code
      that would have populated them never existed. The column set is the
      minimum the original foreign keys and the old metrics queries referred to,
      rather than a faithful reproduction of tables that never held a row.
    */
    await queryRunner.query(`
      CREATE TABLE "battles" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "challenge_id" uuid,
        "status"       "battles_status_enum" NOT NULL DEFAULT 'ready_check',
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "battle_participants" (
        "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "battle_id" uuid NOT NULL REFERENCES "battles"("id") ON DELETE CASCADE,
        "user_id"   uuid NOT NULL,
        "side"      "battle_side_enum" NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "votes" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "battle_id"  uuid NOT NULL REFERENCES "battles"("id") ON DELETE CASCADE,
        "voter_id"   uuid NOT NULL,
        "side"       "battle_side_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "reactions" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "battle_id"  uuid NOT NULL REFERENCES "battles"("id") ON DELETE CASCADE,
        "user_id"    uuid NOT NULL,
        "type"       "reactions_type_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "achievements" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"        varchar(64) NOT NULL UNIQUE,
        "name"        varchar(120) NOT NULL,
        "description" text NOT NULL,
        "stat"        "achievements_stat_enum" NOT NULL,
        "threshold"   integer NOT NULL,
        "tier"        "achievements_tier_enum" NOT NULL,
        "xp_reward"   integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_achievements" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"        uuid NOT NULL,
        "achievement_id" uuid NOT NULL REFERENCES "achievements"("id") ON DELETE CASCADE,
        "unlocked_at"    timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
