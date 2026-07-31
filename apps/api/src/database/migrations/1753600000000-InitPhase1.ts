import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 foundation schema: identity, RBAC, refresh-token lineage, audit trail.
 *
 * Written by hand rather than generated so the index strategy and the extension
 * setup are explicit and reviewable.
 */
export class InitPhase11753600000000 implements MigrationInterface {
  name = 'InitPhase11753600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // citext gives case-insensitive uniqueness for username/email directly on the
    // column, so no call site can forget to lower() before comparing.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);

    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('player', 'manager', 'admin')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM ('active', 'suspended', 'banned', 'deleted')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_experience_level_enum" AS ENUM
        ('beginner', 'intermediate', 'advanced', 'professional')
    `);
    await queryRunner.query(`
      CREATE TYPE "refresh_token_families_revoked_reason_enum" AS ENUM
        ('logout', 'reuse_detected', 'password_changed', 'admin_action', 'expired')
    `);
    await queryRunner.query(`
      CREATE TYPE "activity_logs_action_enum" AS ENUM (
        'user.registered', 'user.logged_in', 'user.logged_out',
        'user.profile_updated', 'user.avatar_updated', 'user.password_changed',
        'admin.role_changed', 'admin.status_changed',
        'security.token_reuse_detected', 'security.login_failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "username"              citext NOT NULL,
        "email"                 citext NOT NULL,
        "password_hash"         text NOT NULL,
        "role"                  "users_role_enum" NOT NULL DEFAULT 'player',
        "status"                "users_status_enum" NOT NULL DEFAULT 'active',
        "suspended_until"       timestamptz,
        "avatar_url"            text,
        "avatar_public_id"      text,
        "bio"                   text,
        "country"               char(2),
        "social_links"          jsonb NOT NULL DEFAULT '{}'::jsonb,
        "experience_level"      "users_experience_level_enum" NOT NULL DEFAULT 'beginner',
        "total_xp"              integer NOT NULL DEFAULT 0,
        "score"                 integer NOT NULL DEFAULT 0,
        "wins"                  integer NOT NULL DEFAULT 0,
        "losses"                integer NOT NULL DEFAULT 0,
        "draws"                 integer NOT NULL DEFAULT 0,
        "total_battles"         integer NOT NULL DEFAULT 0,
        "current_streak"        integer NOT NULL DEFAULT 0,
        "highest_streak"        integer NOT NULL DEFAULT 0,
        "total_votes_received"  integer NOT NULL DEFAULT 0,
        "favorite_category_id"  uuid,
        "org_id"                uuid,
        "last_seen_at"          timestamptz,
        "deleted_at"            timestamptz,
        "created_at"            timestamptz NOT NULL DEFAULT now(),
        "updated_at"            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_username" UNIQUE ("username"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "chk_users_stats_non_negative" CHECK (
          "total_xp" >= 0 AND "wins" >= 0 AND "losses" >= 0 AND "draws" >= 0
          AND "total_battles" >= 0 AND "current_streak" >= 0 AND "highest_streak" >= 0
          AND "total_votes_received" >= 0
        ),
        CONSTRAINT "chk_users_battles_consistent" CHECK (
          "total_battles" = "wins" + "losses" + "draws"
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_users_role_status" ON "users" ("role", "status")
    `);
    // Leaderboard read path: score DESC with id as a stable tiebreaker, which is
    // also exactly the cursor shape used for keyset pagination.
    await queryRunner.query(`
      CREATE INDEX "idx_users_score_desc" ON "users" ("score" DESC, "id")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_users_created_at" ON "users" ("created_at" DESC, "id")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_token_families" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"         uuid NOT NULL,
        "revoked_at"      timestamptz,
        "revoked_reason"  "refresh_token_families_revoked_reason_enum",
        "user_agent"      text,
        "ip_address"      inet,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_rtf_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_rtf_user_active" ON "refresh_token_families" ("user_id", "revoked_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "family_id"       uuid NOT NULL,
        "token_hash"      char(64) NOT NULL,
        "expires_at"      timestamptz NOT NULL,
        "used_at"         timestamptz,
        "replaced_by_id"  uuid,
        "ip_address"      inet,
        "user_agent"      text,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "fk_refresh_tokens_family" FOREIGN KEY ("family_id")
          REFERENCES "refresh_token_families" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens" ("family_id")
    `);
    // Sweeper job predicate: expired tokens that were never rotated.
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_expiry" ON "refresh_tokens" ("expires_at")
      WHERE "used_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "activity_logs" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_id"     uuid,
        "action"       "activity_logs_action_enum" NOT NULL,
        "entity_type"  text,
        "entity_id"    uuid,
        "metadata"     jsonb NOT NULL DEFAULT '{}'::jsonb,
        "ip_address"   inet,
        "user_agent"   text,
        "created_at"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    // No FK on actor_id on purpose: the audit trail must survive a hard-deleted
    // account, otherwise the record of what that account did disappears with it.
    await queryRunner.query(`
      CREATE INDEX "idx_activity_logs_actor_created"
        ON "activity_logs" ("actor_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_activity_logs_action_created"
        ON "activity_logs" ("action", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_token_families"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "activity_logs_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "refresh_token_families_revoked_reason_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_experience_level_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
