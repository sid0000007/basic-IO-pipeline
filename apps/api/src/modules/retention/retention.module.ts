import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RetentionService } from './retention.service';

/**
 * Loaded only by the worker process. Running the cron on the worker:
 *   - keeps slow `DELETE` queries off the chat request pool's connections
 *   - means only one process owns the singleton cron job by construction.
 * If we ever run multiple worker replicas, a Postgres advisory lock around
 * `runRetention()` will keep it singleton.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [RetentionService],
})
export class RetentionModule {}
