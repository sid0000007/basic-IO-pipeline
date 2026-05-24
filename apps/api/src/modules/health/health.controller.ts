import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisIndicator } from './redis.indicator';

type CheckStatus = 'ok' | 'fail';

interface LiveResponse {
  status: 'ok';
}

interface ReadyResponse {
  status: 'ok' | 'degraded';
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
  };
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisIndicator: RedisIndicator,
  ) {}

  @Get('live')
  live(): LiveResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadyResponse> {
    let database: CheckStatus = 'fail';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      database = 'fail';
    }
    const redis = await this.redisIndicator.check();
    const status: ReadyResponse['status'] = database === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { database, redis } };
  }
}
