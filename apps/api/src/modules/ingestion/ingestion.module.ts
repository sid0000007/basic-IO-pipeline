import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IngestionApiKeyGuard } from './api-key.guard';
import { IngestionEnqueuer } from './ingestion-enqueuer.service';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, IngestionApiKeyGuard, IngestionEnqueuer],
  exports: [IngestionService, IngestionEnqueuer],
})
export class IngestionModule {}
