import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EnvService } from '../../config/config.module';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'retention-cleanup' })
  async runRetention(): Promise<void> {
    const days = this.env.get('RETENTION_DAYS');
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const t0 = Date.now();

    // Events are pure debug/audit log; delete entirely past the retention
    // window. The summary view of any inference_request stays intact.
    const eventsDeleted = await this.prisma.inferenceEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    // For ingestion_logs we keep the row (timestamps + status remain queryable
    // for retention statistics) but null the bulky JSON payload columns.
    const logsArchived = await this.prisma.$executeRaw`
      UPDATE ingestion_logs
      SET raw_payload = '{}'::jsonb,
          normalized_payload = NULL
      WHERE received_at < ${cutoff}
        AND (raw_payload <> '{}'::jsonb OR normalized_payload IS NOT NULL)
    `;

    this.logger.log(
      {
        eventsDeleted: eventsDeleted.count,
        logsArchived,
        cutoff: cutoff.toISOString(),
        durationMs: Date.now() - t0,
      },
      'retention-cleanup completed',
    );
  }
}
