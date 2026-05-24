import { Global, Module } from '@nestjs/common';
import { InferenceLoggerService } from './inference-logger.service';
import { IngestionModule } from '../../modules/ingestion/ingestion.module';

@Global()
@Module({
  imports: [IngestionModule],
  providers: [InferenceLoggerService],
  exports: [InferenceLoggerService],
})
export class InferenceLoggerModule {}
