import {
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  type CancelInferenceResponse,
  type PostMessageRequest,
  type PostMessageResponse,
  type SseEvent,
  postMessageRequestSchema,
} from '@olives/types';
import { ZodBody } from '../../common/decorators/zod-body.decorator';
import { ChatService } from './chat.service';
import { StreamRegistry } from './stream-registry';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly streams: StreamRegistry,
  ) {}

  @Post('conversations/:conversationId/messages')
  post(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @ZodBody(postMessageRequestSchema) body: PostMessageRequest,
  ): Promise<PostMessageResponse> {
    return this.chat.startInference(conversationId, body);
  }

  @Sse('conversations/:conversationId/stream/:inferenceRequestId')
  stream(
    @Param('inferenceRequestId', new ParseUUIDPipe()) inferenceRequestId: string,
  ): Observable<MessageEvent> {
    const entry = this.streams.get(inferenceRequestId);
    if (entry === undefined) {
      throw new NotFoundException('Inference not found or expired');
    }
    return new Observable<MessageEvent>((subscriber) => {
      for (const event of entry.buffer) {
        subscriber.next({ data: event });
      }
      if (entry.ended) {
        subscriber.complete();
        return;
      }
      const onEvent = (event: SseEvent): void => {
        subscriber.next({ data: event });
      };
      const onEnd = (): void => {
        subscriber.complete();
      };
      entry.emitter.on('event', onEvent);
      entry.emitter.once('end', onEnd);
      return () => {
        entry.emitter.off('event', onEvent);
        entry.emitter.off('end', onEnd);
      };
    });
  }

  @Post('inferences/:inferenceRequestId/cancel')
  cancel(
    @Param('inferenceRequestId', new ParseUUIDPipe()) inferenceRequestId: string,
  ): Promise<CancelInferenceResponse> {
    return this.chat.requestCancel(inferenceRequestId);
  }
}
