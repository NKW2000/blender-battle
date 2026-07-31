import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 3: live battles, participants, votes, reactions. */
export class Phase3Battles1753800000000 implements MigrationInterface {
  name = 'Phase3Battles1753800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "battles_status_enum" AS ENUM
        ('countdown', 'active', 'voting', 'completed', 'cancelled')
    `);
    await queryRunner.query(`CREATE TYPE "battle_side_enum" AS ENUM ('a', 'b')`);
    await queryRunner.query(`
      CREATE TYPE "battle_result_enum" AS ENUM ('win', 'loss', 'draw')
    `);
    await queryRunner.query(`
      CREATE TYPE "reactions_type_enum" AS ENUM ('fire', 'clap', 'mind_blown', 'laugh')
    `);

    for (const action of [
      'battle.started',
      'battle.completed',
      'battle.cancelled',
      'security.vote_rejected',
    ]) {
      await queryRunner.query(`
        ALTER TYPE "activity_logs_action_enum" ADD VALUE IF NOT EXISTS '${action}'
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "battles" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "challenge_id"     uuid NOT NULL,
        "status"           "battles_status_enum" NOT NULL DEFAULT 'countdown',
        "duration_seconds" integer NOT NULL,
        "started_at"       timestamptz,
        "ends_at"          timestamptz,
        "voting_ends_at"   timestamptz,
        "completed_at"     timestamptz,
        "votes_a"          integer NOT NULL DEFAULT 0,
        "votes_b"          integer NOT NULL DEFAULT 0,
        "winner_side"      "battle_side_enum",
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_battles_challenge" FOREIGN KEY ("challenge_id")
          REFERENCES "challenges" ("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_battles_tallies_non_negative" CHECK (
          "votes_a" >= 0 AND "votes_b" >= 0
        ),
        -- A winner may only exist on a finished battle. Without this a bug in the
        -- sweeper could award XP for a battle that is still being fought.
        CONSTRAINT "chk_battles_winner_completed" CHECK (
          "winner_side" IS NULL OR "status" = 'completed'
        )
      )
    `);

    // The sweeper's hot query: unfinished battles whose deadline has passed.
    // Partial, because completed battles are the overwhelming majority and are
    // never swept again.
    await queryRunner.query(`
      CREATE INDEX "idx_battles_pending_deadlines"
        ON "battles" ("status", "started_at", "ends_at", "voting_ends_at")
        WHERE "status" IN ('countdown', 'active', 'voting')
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_battles_completed_feed"
        ON "battles" ("completed_at" DESC, "id")
        WHERE "status" = 'completed'
    `);

    await queryRunner.query(`
      CREATE TABLE "battle_participants" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "battle_id"   uuid NOT NULL,
        "user_id"     uuid NOT NULL,
        "side"        "battle_side_enum" NOT NULL,
        "result"      "battle_result_enum",
        "xp_awarded"  integer NOT NULL DEFAULT 0,
        "score_delta" integer NOT NULL DEFAULT 0,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_battle_participants_battle" FOREIGN KEY ("battle_id")
          REFERENCES "battles" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_battle_participants_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        -- Nobody competes against themselves.
        CONSTRAINT "uq_battle_participants" UNIQUE ("battle_id", "user_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_battle_participants_user"
        ON "battle_participants" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE "votes" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "battle_id"  uuid NOT NULL,
        "user_id"    uuid NOT NULL,
        "side"       "battle_side_enum" NOT NULL,
        "ip_address" inet,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_votes_battle" FOREIGN KEY ("battle_id")
          REFERENCES "battles" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_votes_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        -- The real one-vote-per-person rule. Application checks lose races against
        -- two tabs and two API instances; this does not.
        CONSTRAINT "uq_votes_battle_user" UNIQUE ("battle_id", "user_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_votes_battle" ON "votes" ("battle_id")`);

    await queryRunner.query(`
      CREATE TABLE "reactions" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "battle_id"  uuid NOT NULL,
        "user_id"    uuid NOT NULL,
        "type"       "reactions_type_enum" NOT NULL,
        "side"       "battle_side_enum" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_reactions_battle" FOREIGN KEY ("battle_id")
          REFERENCES "battles" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_reactions_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reactions_battle_created"
        ON "reactions" ("battle_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "battle_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "battles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reactions_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "battle_result_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "battle_side_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "battles_status_enum"`);
  }
}
