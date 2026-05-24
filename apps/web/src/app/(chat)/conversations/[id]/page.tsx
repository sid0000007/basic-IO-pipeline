import type { ConversationDetail } from '@olives/types';
import { api } from '@/lib/api-client';
import { ChatView } from './chat-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;

  let conv: ConversationDetail | null = null;
  let loadError: string | null = null;
  try {
    conv = await api.getConversation(id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Conversation not found';
  }

  if (conv === null) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">Could not load conversation {id}</p>
        <p className="mt-1 text-xs">{loadError ?? 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold">{conv.title}</h1>
        <p className="text-muted-foreground text-xs">
          {conv.messageCount} messages · status {conv.status}
        </p>
      </div>
      <ChatView conversationId={conv.id} initialMessages={conv.messages} />
    </div>
  );
}
