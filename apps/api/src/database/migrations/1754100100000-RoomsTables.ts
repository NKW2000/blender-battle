import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rooms, participants, submissions and likes.
 *
 * Added alongside the battles tables rather than replacing them: existing battle
 * history stays readable while rooms are built out, and nothing already scored
 * has to be migrated into a shape it was never recorded in.
 */
export class RoomsTables1754100100000 implements MigrationInterface {
  name = 'RoomsTables1754100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rooms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(60) NOT NULL,
        "visibility" "rooms_visibility_enum" NOT NULL DEFAULT 'public',
        "join_code" varchar(12),
        "status" "rooms_status_enum" NOT NULL DEFAULT 'lobby',
        "host_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
        "difficulty" "challenges_difficulty_enum",
        "challenge_id" uuid REFERENCES "challenges"("id") ON DELETE RESTRICT,
        "max_players" integer NOT NULL DEFAULT 8,
        "duration_seconds" integer NOT NULL DEFAULT 1800,
        "starts_at" timestamptz,
        "ends_at" timestamptz,
        "voting_ends_at" timestamptz,
        "completed_at" timestamptz,
        "is_ranked" boolean NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_rooms_status" ON "rooms" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "idx_rooms_visibility_status" ON "rooms" ("visibility", "status")`,
    );
    // Partial: only private rooms carry a code, and two public rooms must not
    // collide on NULL.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_rooms_code" ON "rooms" ("join_code") WHERE "join_code" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "room_participants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" "room_participants_status_enum" NOT NULL DEFAULT 'entered',
        "like_count" integer NOT NULL DEFAULT 0,
        "runoff_votes" integer,
        "placement" integer,
        "result" "battle_result_enum",
        "xp_awarded" integer NOT NULL DEFAULT 0,
        CONSTRAINT "uq_room_participant" UNIQUE ("room_id", "user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_room_participants_user" ON "room_participants" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "submissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
        "participant_id" uuid NOT NULL REFERENCES "room_participants"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "image_url" text NOT NULL,
        "model_url" text,
        "model_filename" varchar(255),
        "notes" text,
        "submitted_at" timestamptz NOT NULL DEFAULT now(),
        "is_hidden" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_submission_participant" UNIQUE ("participant_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_submissions_room" ON "submissions" ("room_id")`);

    await queryRunner.query(`
      CREATE TABLE "submission_likes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
        "submission_id" uuid NOT NULL REFERENCES "submissions"("id") ON DELETE CASCADE,
        "voter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "round" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "uq_submission_like" UNIQUE ("submission_id", "voter_id", "round")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_submission_likes_room" ON "submission_likes" ("room_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "submission_likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "submissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "room_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rooms"`);
  }
}
