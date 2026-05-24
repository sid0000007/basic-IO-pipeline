import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, EnvService } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { LlmProviderModule } from './providers/llm/provider.module';
import { InferenceLoggerModule } from './sdk/inference-logger/inference-logger.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { ChatModule } from './modules/chat/chat.module';
import { RedisModule } from './queues/redis.module';
import { BullMqModule } from './queues/bullmq.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullMqModule,
    LlmProviderModule,
    InferenceLoggerModule,
    HealthModule,
    ConversationsModule,
    ChatModule,
    IngestionModule,
    DashboardModule,
    AdminModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        throttlers: [
          {
            // Default throttler covers chat. Ingestion overrides via @Throttle().
            // Dashboard / admin / health opt out via @SkipThrottle().
            name: 'default',
            ttl: env.get('THROTTLER_TTL_SECONDS') * 1000,
            limit: env.get('THROTTLER_CHAT_LIMIT'),
          },
        ],
      }),
    }),
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
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
