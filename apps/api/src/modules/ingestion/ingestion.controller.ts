import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  type IngestionAcceptResponse,
  type IngestionLogStatusResponse,
  type InferenceLogPayloadV1,
  inferenceLogPayloadV1Schema,
} from '@olives/types';
import { ZodBody } from '../../common/decorators/zod-body.decorator';
import { IngestionApiKeyGuard } from './api-key.guard';
import { IngestionService } from './ingestion.service';

// Ingestion is rate-limited by its API key + bearer guard at the perimeter.
// HTTP-level throttling is a Phase 4 follow-up; opt out here so external
// producers aren't hit by the chat-tuned default throttler.
@SkipThrottle()
@Controller('ingestion')
@UseGuards(IngestionApiKeyGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('inference-logs')
  receive(
    @ZodBody(inferenceLogPayloadV1Schema) body: InferenceLogPayloadV1,
  ): Promise<IngestionAcceptResponse> {
    return this.ingestion.receive(body);
  }

  @Get('logs/:id')
  status(@Param('id', new ParseUUIDPipe()) id: string): Promise<IngestionLogStatusResponse> {
    return this.ingestion.status(id);
  }
}
