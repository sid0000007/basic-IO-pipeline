import type { MessageDto } from '@olives/types';
import { Icon } from '@/components/layout/icon';

interface Props {
  messages: MessageDto[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MessageList({ messages }: Props) {
  return (
    <>
      {messages.map((m) => (
        <MessageBubble key={m.id} m={m} />
      ))}
    </>
  );
}

function MessageBubble({ m }: { m: MessageDto }) {
  const isUser = m.role === 'user';
  const time = formatTime(m.createdAt);
  const streaming = m.status === 'streaming';
  const dim = m.status === 'cancelled' || m.status === 'failed';

  if (isUser) {
    return (
      <div className="msg user">
        <div className="msg-head">
          <span className="msg-author">You</span>
          <span>{time}</span>
        </div>
        <div className={'bubble user' + (dim ? ' dim' : '')}>{m.content}</div>
      </div>
    );
  }

  return (
    <div className="msg assistant">
      <div className="msg-head">
        <span className="msg-author">Olive</span>
        <span>{time}</span>
        {streaming && (
          <>
            <span>·</span>
            <span>streaming…</span>
          </>
        )}
        {m.status === 'cancelled' && (
          <>
            <span>·</span>
            <span>cancelled</span>
          </>
        )}
        {m.status === 'failed' && (
          <>
            <span>·</span>
            <span>failed</span>
          </>
        )}
      </div>
      <div className={'bubble assistant' + (dim ? ' dim' : '')}>
        {m.content.length === 0 && streaming ? (
          <span className="typing">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <>
            {m.content}
            {streaming && m.content.length > 0 && (
              <span style={{ marginLeft: 2, opacity: 0.6 }}>▋</span>
            )}
          </>
        )}
      </div>
      {!streaming && m.content.length > 0 && (
        <div className="msg-actions">
          <button type="button">
            <Icon name="copy" size={11} /> Copy
          </button>
          <button type="button">
            <Icon name="refresh" size={11} /> Regenerate
          </button>
          <button type="button" aria-label="thumbs up">
            <Icon name="thumbsup" size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
