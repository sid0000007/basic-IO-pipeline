import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisIndicator } from './redis.indicator';

@Module({
  controllers: [HealthController],
  providers: [RedisIndicator],
})
export class HealthModule {}
