import Link from 'next/link';
import { api } from '@/lib/api-client';
import { ConversationList } from '@/components/chat/conversation-list';
import { NewConversationButton } from './new-button';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  let items: Awaited<ReturnType<typeof api.listConversations>>['items'] = [];
  let loadError: string | null = null;
  try {
    const res = await api.listConversations({ limit: 50 });
    items = res.items;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load conversations';
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="text-muted-foreground text-sm">
            Resume any conversation or start a new one.
          </p>
        </div>
        <NewConversationButton />
      </div>
      {loadError !== null ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not load conversations</p>
          <p className="mt-1 text-xs">{loadError}</p>
          <p className="mt-2 text-xs">
            Check that the api is running at the configured base URL and that the database is
            reachable.
          </p>
        </div>
      ) : (
        <ConversationList items={items} />
      )}
      <p className="text-muted-foreground mt-6 text-xs">
        Dashboard, ingestion, and metrics arrive in Phase 2.{' '}
        <Link href="/" className="underline">
          Home
        </Link>
      </p>
    </div>
  );
}
