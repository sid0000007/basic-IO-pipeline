'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ConversationSummary } from '@olives/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NewConversationButton } from './new-conversation-button';

interface Props {
  items: ConversationSummary[];
  loadError: string | null;
}

export function ConversationsSidebar({ items, loadError }: Props) {
  const pathname = usePathname();
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 border-r pr-4">
      <NewConversationButton />
      {loadError !== null ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <p className="font-medium">Could not load conversations</p>
          <p className="mt-1">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-xs">No conversations yet.</p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {items.map((c) => {
            const isActive = pathname === `/conversations/${c.id}`;
            return (
              <li key={c.id}>
                <Link
                  href={`/conversations/${c.id}`}
                  className={cn(
                    'block rounded-md px-3 py-2 transition-colors',
                    isActive ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</p>
                    {c.status !== 'active' && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {c.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}
                    {c.lastMessageAt !== null && (
                      <> · {new Date(c.lastMessageAt).toLocaleDateString()}</>
                    )}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
