import { beforeEach, describe, expect, it } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import { ConversationsService } from '../../src/modules/conversations/conversations.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ConversationsService.create', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: ConversationsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new ConversationsService(prisma);
  });

  it('inserts with the anonymous user id and returns a summary', async () => {
    const now = new Date('2026-05-24T10:00:00.000Z');
    prisma.conversation.create.mockResolvedValue({
      id: 'c-1',
      userId: '00000000-0000-0000-0000-000000000001',
      title: 'first',
      status: 'active',
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
      _count: { messages: 0 },
    });

    const result = await service.create({ title: 'first' });

    expect(prisma.conversation.create).toHaveBeenCalledOnce();
    const callArg = prisma.conversation.create.mock.calls[0]?.[0];
    expect(callArg?.data.userId).toBe('00000000-0000-0000-0000-000000000001');
    expect(callArg?.data.title).toBe('first');
    expect(result.id).toBe('c-1');
    expect(result.title).toBe('first');
    expect(result.status).toBe('active');
    expect(result.messageCount).toBe(0);
    expect(result.lastMessageAt).toBeNull();
    expect(result.createdAt).toBe('2026-05-24T10:00:00.000Z');
  });

  it('falls back to "New conversation" title when none provided', async () => {
    const now = new Date('2026-05-24T11:00:00.000Z');
    prisma.conversation.create.mockResolvedValue({
      id: 'c-2',
      userId: '00000000-0000-0000-0000-000000000001',
      title: 'New conversation',
      status: 'active',
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
      _count: { messages: 0 },
    });

    await service.create({});

    const callArg = prisma.conversation.create.mock.calls[0]?.[0];
    expect(callArg?.data.title).toBe('New conversation');
  });
});
