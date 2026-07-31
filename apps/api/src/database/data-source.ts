import 'reflect-metadata';

import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

// The TypeORM CLI runs outside the Nest container, so it loads env itself. Same
// search order as ConfigModule: app-local first, then the monorepo root.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
loadEnv({ path: join(__dirname, '../../../../.env.local') });
loadEnv({ path: join(__dirname, '../../../../.env') });

/**
 * CLI-only DataSource: migration generate/run/revert.
 * The application gets its DataSource from TypeOrmModule.forRootAsync instead.
 *
 * `synchronize` is absent, not merely false — schema changes travel through
 * reviewed, reversible migration files in every environment including local dev.
 * Auto-sync silently drops columns it does not recognise.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'blender_battle',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'migrations',
  /**
   * Each migration in its own transaction, not one transaction for the batch.
   * Postgres refuses to use an enum value in the same transaction that added it,
   * so a two-step "add the value, then use it" change is only possible this way.
   */
  migrationsTransactionMode: 'each',
});
