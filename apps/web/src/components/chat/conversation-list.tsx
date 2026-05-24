import Link from 'next/link';
import type { ConversationSummary } from '@olives/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  items: ConversationSummary[];
}

export function ConversationList({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No conversations yet. Start a new one to chat.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/conversations/${c.id}`} className="block">
            <Card className="hover:bg-accent flex flex-row items-center justify-between p-4 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="text-muted-foreground text-xs">
                  {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}
                  {c.lastMessageAt !== null && (
                    <> · last activity {new Date(c.lastMessageAt).toLocaleString()}</>
                  )}
                </p>
              </div>
              <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
