import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../queues/redis.module';

@Injectable()
export class RedisIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(): Promise<'ok' | 'fail'> {
    try {
      const res = await this.redis.ping();
      return res === 'PONG' ? 'ok' : 'fail';
    } catch {
      return 'fail';
    }
  }
}
