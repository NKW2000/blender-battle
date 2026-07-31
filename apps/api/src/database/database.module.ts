import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfig } from '@/config/app.config';
import { ConfigModule } from '@/config/config.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        type: 'postgres' as const,
        ...config.database,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        // Never true, in any environment. Schema moves only through migrations so
        // that every change is reviewed, ordered, and reversible.
        synchronize: false,
        migrationsRun: false,
        logging: config.isProduction ? ['error', 'warn'] : ['error', 'warn', 'migration'],
        // Bound the pool so a traffic spike queues inside the app instead of
        // exhausting Postgres connection slots across all instances.
        extra: { max: 20, idleTimeoutMillis: 30_000 },
      }),
    }),
  ],
})
export class DatabaseModule {}
