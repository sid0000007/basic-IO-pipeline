import { api } from '@/lib/api-client';
import { ConversationsSidebar } from '@/components/chat/conversations-sidebar';

export const dynamic = 'force-dynamic';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  let items: Awaited<ReturnType<typeof api.listConversations>>['items'] = [];
  let loadError: string | null = null;
  try {
    const res = await api.listConversations({ limit: 50 });
    items = res.items;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load conversations';
  }

  return (
    <div className="chat-grid">
      <ConversationsSidebar items={items} loadError={loadError} />
      <main className="chat-main">{children}</main>
    </div>
  );
}
