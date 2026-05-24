import { api } from '@/lib/api-client';
import { SiteHeader } from '@/components/layout/site-header';
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
    <div className="flex h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 gap-6 px-6 py-6">
        <ConversationsSidebar items={items} loadError={loadError} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
