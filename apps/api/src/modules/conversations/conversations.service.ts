import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ConversationDetail,
  ConversationSummary,
  CreateConversationRequest,
  ListConversationsQuery,
  ListConversationsResponse,
  MessageDto,
  UpdateConversationRequest,
} from '@olives/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ANONYMOUS_USER_ID } from '../../common/seeding/anonymous-user';

interface CursorPosition {
  updatedAt: Date;
  id: string;
}

function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(`${pos.updatedAt.toISOString()}|${pos.id}`).toString('base64url');
}

function decodeCursor(s: string): CursorPosition | null {
  try {
    const decoded = Buffer.from(s, 'base64url').toString('utf8');
    const sep = decoded.indexOf('|');
    if (sep === -1) return null;
    const updatedAt = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(updatedAt.getTime()) || id.length === 0) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

interface ConversationRowWithCount {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'cancelled' | 'archived';
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
}

function toSummary(row: ConversationRowWithCount): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    lastMessageAt: row.lastMessageAt !== null ? row.lastMessageAt.toISOString() : null,
    messageCount: row._count.messages,
    createdAt: row.createdAt.toISOString(),
  };
}

interface MessageRow {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  contentPreview: string | null;
  sequenceNumber: number;
  status: 'completed' | 'streaming' | 'cancelled' | 'failed';
  createdAt: Date;
}

function toMessageDto(m: MessageRow): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    contentPreview: m.contentPreview,
    sequenceNumber: m.sequenceNumber,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: CreateConversationRequest): Promise<ConversationSummary> {
    const row = await this.prisma.conversation.create({
      data: {
        userId: ANONYMOUS_USER_ID,
        title: body.title ?? 'New conversation',
      },
      include: { _count: { select: { messages: true } } },
    });
    return toSummary(row);
  }

  async list(query: ListConversationsQuery): Promise<ListConversationsResponse> {
    const cursor = query.cursor !== undefined ? decodeCursor(query.cursor) : null;

    const rows = await this.prisma.conversation.findMany({
      where: {
        userId: ANONYMOUS_USER_ID,
        ...(query.status !== undefined && { status: query.status }),
        ...(cursor !== null && {
          OR: [
            { updatedAt: { lt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { _count: { select: { messages: true } } },
    });

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const items = pageRows.map(toSummary);

    let nextCursor: string | null = null;
    if (hasMore) {
      const lastRow = pageRows[pageRows.length - 1];
      if (lastRow !== undefined) {
        nextCursor = encodeCursor({ updatedAt: lastRow.updatedAt, id: lastRow.id });
      }
    }

    return { items, nextCursor };
  }

  async get(id: string): Promise<ConversationDetail> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { sequenceNumber: 'asc' } },
      },
    });
    if (row === null) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return {
      ...toSummary(row),
      messages: row.messages.map(toMessageDto),
    };
  }

  async update(id: string, body: UpdateConversationRequest): Promise<ConversationSummary> {
    try {
      const row = await this.prisma.conversation.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.status !== undefined && { status: body.status }),
        },
        include: { _count: { select: { messages: true } } },
      });
      return toSummary(row);
    } catch {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
  }
}
