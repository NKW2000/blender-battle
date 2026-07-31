import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2: challenges, categories, tags, and reference assets.
 *
 * Also completes the users.favorite_category_id foreign key that Phase 1 left as
 * a bare column — additive, exactly as that migration anticipated.
 */
export class Phase2Challenges1753700000000 implements MigrationInterface {
  name = 'Phase2Challenges1753700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "challenges_difficulty_enum" AS ENUM ('easy', 'medium', 'hard')
    `);
    await queryRunner.query(`
      CREATE TYPE "challenges_status_enum" AS ENUM ('draft', 'published', 'archived')
    `);
    await queryRunner.query(`
      CREATE TYPE "challenges_visibility_enum" AS ENUM ('public', 'unlisted', 'private')
    `);
    await queryRunner.query(`
      CREATE TYPE "challenge_assets_type_enum" AS ENUM ('reference_image', 'reference_file')
    `);

    await queryRunner.query(`
      ALTER TYPE "activity_logs_action_enum" ADD VALUE IF NOT EXISTS 'challenge.created'
    `);
    for (const action of [
      'challenge.updated',
      'challenge.published',
      'challenge.archived',
      'challenge.deleted',
      'challenge.drawn',
      'category.created',
      'category.updated',
    ]) {
      await queryRunner.query(`
        ALTER TYPE "activity_logs_action_enum" ADD VALUE IF NOT EXISTS '${action}'
      `);
    }

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"        citext NOT NULL,
        "name"        text NOT NULL,
        "description" text,
        "sort_order"  integer NOT NULL DEFAULT 0,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"       citext NOT NULL,
        "name"       text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_tags_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "challenges" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"              citext NOT NULL,
        "title"             text NOT NULL,
        "description"       text NOT NULL,
        "difficulty"        "challenges_difficulty_enum" NOT NULL,
        "category_id"       uuid NOT NULL,
        "estimated_minutes" integer NOT NULL,
        "blender_version"   text,
        "rules"             text,
        "objectives"        jsonb NOT NULL DEFAULT '[]'::jsonb,
        "allowed_assets"    text,
        "forbidden_assets"  text,
        "reward_xp"         integer NOT NULL,
        "status"            "challenges_status_enum" NOT NULL DEFAULT 'draft',
        "visibility"        "challenges_visibility_enum" NOT NULL DEFAULT 'public',
        "published_at"      timestamptz,
        "created_by_id"     uuid NOT NULL,
        "times_played"      integer NOT NULL DEFAULT 0,
        "deleted_at"        timestamptz,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_challenges_slug" UNIQUE ("slug"),
        CONSTRAINT "fk_challenges_category" FOREIGN KEY ("category_id")
          REFERENCES "categories" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_challenges_author" FOREIGN KEY ("created_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_challenges_minutes" CHECK (
          "estimated_minutes" BETWEEN 5 AND 480
        ),
        CONSTRAINT "chk_challenges_reward_xp" CHECK (
          "reward_xp" BETWEEN 10 AND 1000
        ),
        -- A published challenge must have a publication timestamp. Without this
        -- the ordering of the browse feed silently degrades to created_at.
        CONSTRAINT "chk_challenges_published_at" CHECK (
          "status" <> 'published' OR "published_at" IS NOT NULL
        )
      )
    `);

    // Serves both the browse feed and the random draw. Partial, because rows that
    // are not published+public are never eligible for either path.
    await queryRunner.query(`
      CREATE INDEX "idx_challenges_draw"
        ON "challenges" ("category_id", "difficulty")
        WHERE "status" = 'published' AND "visibility" = 'public' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_challenges_feed"
        ON "challenges" ("published_at" DESC, "id")
        WHERE "status" = 'published' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_challenges_author"
        ON "challenges" ("created_by_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "challenge_tags" (
        "challenge_id" uuid NOT NULL,
        "tag_id"       uuid NOT NULL,
        PRIMARY KEY ("challenge_id", "tag_id"),
        CONSTRAINT "fk_challenge_tags_challenge" FOREIGN KEY ("challenge_id")
          REFERENCES "challenges" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_challenge_tags_tag" FOREIGN KEY ("tag_id")
          REFERENCES "tags" ("id") ON DELETE CASCADE
      )
    `);
    // Reverse lookup: every challenge carrying a given tag.
    await queryRunner.query(`
      CREATE INDEX "idx_challenge_tags_tag" ON "challenge_tags" ("tag_id", "challenge_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "challenge_assets" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "challenge_id" uuid NOT NULL,
        "type"         "challenge_assets_type_enum" NOT NULL,
        "url"          text NOT NULL,
        "public_id"    text NOT NULL,
        "filename"     text NOT NULL,
        "bytes"        integer NOT NULL,
        "mime_type"    text NOT NULL,
        "sort_order"   integer NOT NULL DEFAULT 0,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_challenge_assets_challenge" FOREIGN KEY ("challenge_id")
          REFERENCES "challenges" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_challenge_assets_challenge"
        ON "challenge_assets" ("challenge_id", "sort_order")
    `);

    // Phase 1 declared this column without a constraint because the target table
    // did not exist yet. Adding it now is purely additive.
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "fk_users_favorite_category"
        FOREIGN KEY ("favorite_category_id") REFERENCES "categories" ("id")
        ON DELETE SET NULL
    `);

    const categories: Array<[string, string, string]> = [
      ['modeling', 'Modeling', 'Build the form. Topology, proportion, silhouette.'],
      ['sculpting', 'Sculpting', 'Push clay. Organic shapes and high-frequency detail.'],
      ['animation', 'Animation', 'Make it move with weight and timing.'],
      ['rigging', 'Rigging', 'Build the controls someone else can animate with.'],
      ['lighting', 'Lighting', 'Shape the scene with light alone.'],
      ['materials', 'Materials', 'Author surfaces that read as the real thing.'],
      ['texturing', 'Texturing', 'Paint and project detail onto the surface.'],
      ['geometry-nodes', 'Geometry Nodes', 'Solve it procedurally. No manual placement.'],
      ['environment', 'Environment', 'Build a place, not an object.'],
      ['hard-surface', 'Hard Surface', 'Panels, bevels, and mechanical precision.'],
      ['character', 'Character', 'Someone who could hold a scene on their own.'],
      ['product-visualization', 'Product Visualization', 'Sell the object. Clean, deliberate, commercial.'],
      ['vfx', 'VFX', 'Simulation, destruction, and effects work.'],
      ['rendering', 'Rendering', 'Camera, composition, and the final frame.'],
    ];

    for (const [index, [slug, name, description]] of categories.entries()) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug", "name", "description", "sort_order")
         VALUES ($1, $2, $3, $4)`,
        [slug, name, description, index],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "fk_users_favorite_category"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_assets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "challenge_assets_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "challenges_visibility_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "challenges_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "challenges_difficulty_enum"`);
    // Postgres cannot remove a value from an enum type; the activity_logs action
    // members added above are intentionally left in place.
  }
}
