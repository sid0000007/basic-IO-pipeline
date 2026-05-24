import type { MessageDto } from '@olives/types';

interface Props {
  messages: MessageDto[];
}

export function MessageList({ messages }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          role={m.role}
          content={m.content}
          streaming={m.status === 'streaming'}
          dim={m.status === 'cancelled' || m.status === 'failed'}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
  dim,
}: {
  role: string;
  content: string;
  streaming?: boolean;
  dim?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          (isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground') +
          ' max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap' +
          (dim === true ? ' opacity-60' : '')
        }
      >
        {content.length === 0 && streaming === true ? '…' : content}
        {streaming === true && content.length > 0 && (
          <span className="ml-1 inline-block animate-pulse">▋</span>
        )}
      </div>
    </div>
  );
}
