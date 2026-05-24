import { Module } from '@nestjs/common';
import { LoggingPipelineProcessor } from './logging-pipeline.processor';

/**
 * Loaded only by the worker process (`worker.module.ts`).
 *
 * The api process does NOT import this — that would spin up a BullMQ Worker
 * inside the HTTP server, which is exactly the coupling we want to avoid.
 */
@Module({
  providers: [LoggingPipelineProcessor],
})
export class LoggingPipelineModule {}
