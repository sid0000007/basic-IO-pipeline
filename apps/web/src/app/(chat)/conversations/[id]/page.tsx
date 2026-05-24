import type { ConversationDetail } from '@olives/types';
import { Icon } from '@/components/layout/icon';
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
      <>
        <div className="chat-head">
          <div>
            <h1>Conversation not found</h1>
            <div className="sub">
              <span>id {id}</span>
            </div>
          </div>
        </div>
        <div className="thread">
          <div
            style={{
              border: '1px solid color-mix(in oklch, var(--err) 30%, transparent)',
              background: 'color-mix(in oklch, var(--err) 8%, transparent)',
              color: 'var(--err)',
              padding: 16,
              borderRadius: 'var(--radius)',
              fontSize: 13,
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>Could not load this conversation.</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>{loadError ?? 'Unknown error.'}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="chat-head">
        <div>
          <h1>{conv.title}</h1>
          <div className="sub">
            <span className="pill">
              <span className="live-dot" /> {conv.status === 'active' ? 'Active session' : conv.status}
            </span>
            <span>
              {conv.messageCount} {conv.messageCount === 1 ? 'message' : 'messages'}
            </span>
            <span>·</span>
            <span>Olive · claude-sonnet-4-6</span>
          </div>
        </div>
        <div className="chat-actions">
          <button type="button" className="btn btn-ghost btn-sm">
            <Icon name="download" size={13} /> Export
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="more">
            <Icon name="more" size={14} />
          </button>
        </div>
      </div>

      <ChatView conversationId={conv.id} initialMessages={conv.messages} />
    </>
  );
}
