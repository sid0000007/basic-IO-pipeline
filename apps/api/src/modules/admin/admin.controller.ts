import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { INGESTION_QUEUE } from '../../queues/bullmq.module';
import { KNOWN_QUEUES, QUEUE_INGESTION_PROCESSING } from '../../queues/queue-names';

interface FailedJobView {
  id: string | undefined;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

interface RetryResult {
  retried: number;
}

@SkipThrottle()
@Controller('admin/queues')
export class AdminController {
  constructor(@Inject(INGESTION_QUEUE) private readonly ingestionQueue: Queue) {}

  @Get(':queueName/failed')
  async failed(
    @Param('queueName') name: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ): Promise<FailedJobView[]> {
    this.assertKnownQueue(name);
    const jobs = await this.ingestionQueue.getFailed(0, Math.max(0, limit - 1));
    return jobs.map(
      (j): FailedJobView => ({
        id: j.id,
        name: j.name,
        failedReason: j.failedReason ?? null,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
        data: j.data,
      }),
    );
  }

  @Post(':queueName/failed/:jobId/retry')
  async retryOne(
    @Param('queueName') name: string,
    @Param('jobId') jobId: string,
  ): Promise<RetryResult> {
    this.assertKnownQueue(name);
    const job = await this.ingestionQueue.getJob(jobId);
    if (job === undefined) {
      throw new NotFoundException(`Job ${jobId} not found in queue ${name}`);
    }
    await job.retry();
    return { retried: 1 };
  }

  @Post(':queueName/failed/retry-all')
  async retryAll(
    @Param('queueName') name: string,
    @Query('limit', new DefaultValuePipe(1000), ParseIntPipe) limit: number,
  ): Promise<RetryResult> {
    this.assertKnownQueue(name);
    const failed = await this.ingestionQueue.getFailed(0, Math.max(0, limit - 1));
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        // Skip jobs that can't be retried (e.g. already moved out of failed
        // state by a concurrent admin action). Don't fail the whole batch.
      }
    }
    return { retried };
  }

  private assertKnownQueue(name: string): void {
    if (name !== QUEUE_INGESTION_PROCESSING) {
      throw new NotFoundException(
        `Unknown queue: ${name}. Known queues: ${KNOWN_QUEUES.join(', ')}`,
      );
    }
  }
}
