import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, EnvService } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './queues/redis.module';
import { BullMqModule } from './queues/bullmq.module';
import { LoggingPipelineModule } from './modules/logging-pipeline/logging-pipeline.module';
import { RetentionModule } from './modules/retention/retention.module';

/**
 * Loaded by the worker process bootstrap in `worker.ts`.
 *
 * Imports only what the worker needs — no HTTP controllers, no chat module,
 * no provider abstraction. The worker shares the codebase with the api but
 * runs an entirely separate Nest application context, so a crash in either
 * does not affect the other.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullMqModule,
    LoggingPipelineModule,
    RetentionModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [EnvService],
      useFactory: (env: EnvService) => {
        const isDev = env.get('NODE_ENV') === 'development';
        return {
          pinoHttp: {
            level: env.get('LOG_LEVEL'),
            ...(isDev && {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              },
            }),
          },
        };
      },
    }),
  ],
})
export class WorkerModule {}
