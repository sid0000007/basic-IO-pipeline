import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CheckStatus = 'ok' | 'fail';

interface LiveResponse {
  status: 'ok';
}

interface ReadyResponse {
  status: 'ok' | 'degraded';
  checks: {
    database: CheckStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      checks: { database },
    };
  }
}
