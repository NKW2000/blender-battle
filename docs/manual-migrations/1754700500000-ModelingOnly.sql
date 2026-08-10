-- ModelingOnly1754700500000, by hand.
--
-- The equivalent of `pnpm --filter @bb/api migration:run` for this one
-- migration, for when the machine holding the repository cannot reach Postgres
-- on 5432. Paste it into the Neon SQL Editor.
--
-- It is the same statements the TypeScript migration runs, in the same order,
-- plus the row in `migrations` that records it as applied — without that last
-- INSERT, TypeORM would run the whole thing again the next time migrations are
-- run properly, and the DELETE would be a no-op but the bookkeeping would be
-- wrong for every migration that follows.
--
-- Wrapped in a transaction: if any statement fails, nothing is committed. Run
-- it as one block, not statement by statement.
--
-- WHAT IT DESTROYS: thirteen category rows, and which category each challenge
-- and room belonged to. Everything is repointed to Modeling first, so no row is
-- orphaned, but the previous assignment is not recorded anywhere and reverting
-- restores the list, not the assignments.

BEGIN;

-- Created only if missing. On this deployment it already exists.
INSERT INTO "categories" ("slug", "name", "description", "sort_order")
SELECT 'modeling', 'Modeling', 'Build the form. Topology, proportion, silhouette.', 0
WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'modeling');

-- Repoint every reference BEFORE deleting anything. `challenges.category_id` is
-- NOT NULL, so deleting first would be a foreign key violation, and `rooms`
-- would silently have its category nulled by ON DELETE SET NULL — which changes
-- which briefs that room can draw.
UPDATE "challenges"
SET "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'modeling')
WHERE "category_id" <> (SELECT "id" FROM "categories" WHERE "slug" = 'modeling');

UPDATE "rooms"
SET "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'modeling')
WHERE "category_id" IS NOT NULL
  AND "category_id" <> (SELECT "id" FROM "categories" WHERE "slug" = 'modeling');

-- Cleared rather than rewritten: claiming everyone's favourite discipline is
-- Modeling would be inventing data. It is nullable and cosmetic.
UPDATE "users"
SET "favorite_category_id" = NULL
WHERE "favorite_category_id" IS NOT NULL
  AND "favorite_category_id" <> (SELECT "id" FROM "categories" WHERE "slug" = 'modeling');

DELETE FROM "categories" WHERE "slug" <> 'modeling';

-- Records the migration as applied, so `migration:run` skips it later.
INSERT INTO "migrations" ("timestamp", "name")
SELECT 1754700500000, 'ModelingOnly1754700500000'
WHERE NOT EXISTS (SELECT 1 FROM "migrations" WHERE "name" = 'ModelingOnly1754700500000');

COMMIT;

-- Check afterwards. Expect one row, and 14 in the second column becoming 1.
-- SELECT count(*) FROM "categories";
-- SELECT slug FROM "categories";
