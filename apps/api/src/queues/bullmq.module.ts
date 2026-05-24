import { Global, Inject, Module, OnModuleDestroy, Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { REDIS_CLIENT, RedisModule } from './redis.module';
import { QUEUE_INGESTION_PROCESSING } from './queue-names';

export const INGESTION_QUEUE = 'INGESTION_QUEUE';

const ingestionQueueProvider: Provider = {
  provide: INGESTION_QUEUE,
  inject: [REDIS_CLIENT],
  useFactory: (redis: Redis): Queue => {
    return new Queue(QUEUE_INGESTION_PROCESSING, { connection: redis });
  },
};

@Global()
@Module({
  imports: [RedisModule],
  providers: [ingestionQueueProvider],
  exports: [ingestionQueueProvider],
})
export class BullMqModule implements OnModuleDestroy {
  constructor(@Inject(INGESTION_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined);
  }
}
