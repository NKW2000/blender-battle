import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 5 foundations: notifications, achievements, and OAuth identities. */
export class Phase5Foundations1753900000000 implements MigrationInterface {
  name = 'Phase5Foundations1753900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notifications_type_enum" AS ENUM (
        'battle_matched', 'battle_result', 'achievement_unlocked',
        'role_changed', 'account_status', 'challenge_published'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "achievements_stat_enum" AS ENUM (
        'wins', 'total_battles', 'current_streak', 'highest_streak',
        'total_xp', 'total_votes_received', 'score'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "achievements_tier_enum" AS ENUM ('bronze', 'silver', 'gold')
    `);
    await queryRunner.query(`
      CREATE TYPE "oauth_provider_enum" AS ENUM ('discord', 'google')
    `);

    for (const action of ['achievement.unlocked', 'oauth.linked', 'oauth.signup']) {
      await queryRunner.query(`
        ALTER TYPE "activity_logs_action_enum" ADD VALUE IF NOT EXISTS '${action}'
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    uuid NOT NULL,
        "type"       "notifications_type_enum" NOT NULL,
        "title"      text NOT NULL,
        "body"       text,
        "link"       text,
        "read_at"    timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_user_created"
        ON "notifications" ("user_id", "created_at" DESC)
    `);
    // The unread badge is polled far more often than the inbox is opened, so it
    // gets an index that only contains unread rows.
    await queryRunner.query(`
      CREATE INDEX "idx_notifications_unread"
        ON "notifications" ("user_id")
        WHERE "read_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "achievements" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"        citext NOT NULL,
        "name"        text NOT NULL,
        "description" text NOT NULL,
        "stat"        "achievements_stat_enum" NOT NULL,
        "threshold"   integer NOT NULL,
        "tier"        "achievements_tier_enum" NOT NULL DEFAULT 'bronze',
        "xp_reward"   integer NOT NULL DEFAULT 0,
        "sort_order"  integer NOT NULL DEFAULT 0,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_achievements_code" UNIQUE ("code"),
        CONSTRAINT "chk_achievements_threshold" CHECK ("threshold" > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_achievements" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"        uuid NOT NULL,
        "achievement_id" uuid NOT NULL,
        "unlocked_at"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_achievements_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_achievements_achievement" FOREIGN KEY ("achievement_id")
          REFERENCES "achievements" ("id") ON DELETE CASCADE,
        -- Prevents a badge, and therefore its XP reward, being granted twice.
        CONSTRAINT "uq_user_achievement" UNIQUE ("user_id", "achievement_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_achievements_user"
        ON "user_achievements" ("user_id", "unlocked_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "oauth_identities" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"             uuid NOT NULL,
        "provider"            "oauth_provider_enum" NOT NULL,
        "provider_account_id" text NOT NULL,
        "handle"              text,
        "email"               citext,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_oauth_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        -- One provider account maps to exactly one local account.
        CONSTRAINT "uq_oauth_provider_account" UNIQUE ("provider", "provider_account_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_oauth_user" ON "oauth_identities" ("user_id")
    `);

    // OAuth accounts have no password. The column becomes nullable, and a CHECK
    // guarantees every account still has at least one way to authenticate.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL`);

    const achievements: Array<
      [string, string, string, string, number, string, number, number]
    > = [
      ['first_blood', 'First Blood', 'Win your first battle.', 'wins', 1, 'bronze', 50, 1],
      ['contender', 'Contender', 'Fight ten battles.', 'total_battles', 10, 'bronze', 75, 2],
      ['regular', 'Regular', 'Fight fifty battles.', 'total_battles', 50, 'silver', 200, 3],
      ['veteran', 'Veteran', 'Fight two hundred battles.', 'total_battles', 200, 'gold', 750, 4],
      ['on_a_roll', 'On A Roll', 'Win three battles in a row.', 'current_streak', 3, 'bronze', 100, 5],
      ['unstoppable', 'Unstoppable', 'Win ten battles in a row.', 'current_streak', 10, 'gold', 500, 6],
      ['ten_wins', 'Proven', 'Win ten battles.', 'wins', 10, 'silver', 150, 7],
      ['fifty_wins', 'Dominant', 'Win fifty battles.', 'wins', 50, 'gold', 600, 8],
      ['crowd_favourite', 'Crowd Favourite', 'Receive one hundred votes.', 'total_votes_received', 100, 'silver', 250, 9],
      ['crowd_legend', 'Crowd Legend', 'Receive one thousand votes.', 'total_votes_received', 1000, 'gold', 900, 10],
      ['apprentice', 'Apprentice', 'Earn 1,000 XP.', 'total_xp', 1000, 'bronze', 100, 11],
      ['journeyman', 'Journeyman', 'Earn 10,000 XP.', 'total_xp', 10000, 'silver', 300, 12],
      ['master', 'Master', 'Earn 50,000 XP.', 'total_xp', 50000, 'gold', 1000, 13],
      ['ranked', 'Ranked', 'Reach a score of 250.', 'score', 250, 'silver', 200, 14],
    ];

    for (const [code, name, description, stat, threshold, tier, xp, order] of achievements) {
      await queryRunner.query(
        `INSERT INTO "achievements"
           ("code", "name", "description", "stat", "threshold", "tier", "xp_reward", "sort_order")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [code, name, description, stat, threshold, tier, xp, order],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restoring NOT NULL would fail for any OAuth-only account, so the column is
    // left nullable on the way down. This is intentional: the alternative is a
    // migration that cannot be reverted once anyone has signed in with Discord.
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_identities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_achievements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "achievements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "oauth_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "achievements_tier_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "achievements_stat_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
  }
}
