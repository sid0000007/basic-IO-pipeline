import { Global, Inject, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EnvService } from '../config/config.module';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [EnvService],
  useFactory: (env: EnvService): Redis => {
    return new Redis(env.get('REDIS_URL'), {
      // BullMQ requires `maxRetriesPerRequest: null` so blocking commands
      // don't fail after a short retry budget.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [redisProvider],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
