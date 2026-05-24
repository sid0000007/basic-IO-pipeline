import { Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  type ConversationDetail,
  type ConversationSummary,
  type CreateConversationRequest,
  type ListConversationsQuery,
  type ListConversationsResponse,
  type UpdateConversationRequest,
  createConversationRequestSchema,
  listConversationsQuerySchema,
  updateConversationRequestSchema,
} from '@olives/types';
import { ZodBody } from '../../common/decorators/zod-body.decorator';
import { ZodQuery } from '../../common/decorators/zod-query.decorator';
import { ConversationsService } from './conversations.service';

@Controller('chat/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  create(
    @ZodBody(createConversationRequestSchema) body: CreateConversationRequest,
  ): Promise<ConversationSummary> {
    return this.conversations.create(body);
  }

  @Get()
  list(
    @ZodQuery(listConversationsQuerySchema) query: ListConversationsQuery,
  ): Promise<ListConversationsResponse> {
    return this.conversations.list(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ConversationDetail> {
    return this.conversations.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(updateConversationRequestSchema) body: UpdateConversationRequest,
  ): Promise<ConversationSummary> {
    return this.conversations.update(id, body);
  }
}
