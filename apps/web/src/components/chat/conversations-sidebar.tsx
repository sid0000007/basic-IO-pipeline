'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ConversationSummary } from '@olives/types';
import { NewConversationButton } from './new-conversation-button';

interface Props {
  items: ConversationSummary[];
  loadError: string | null;
}

function formatRelative(iso: string | null): string {
  if (iso === null) return 'no activity';
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  ) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function statusTag(status: ConversationSummary['status']): string | null {
  if (status === 'active') return 'OPEN';
  if (status === 'completed') return 'DONE';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'archived') return 'ARCHIVED';
  return null;
}

export function ConversationsSidebar({ items, loadError }: Props) {
  const pathname = usePathname();
  const active = items.filter((c) => c.status === 'active').slice(0, 2);
  const recent = items.filter((c) => !active.includes(c));

  return (
    <aside className="rail">
      <NewConversationButton />

      <input type="search" className="rail-search" placeholder="Search conversations…" />

      {loadError !== null && (
        <div
          style={{
            padding: 10,
            border: '1px solid color-mix(in oklch, var(--err) 30%, transparent)',
            borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in oklch, var(--err) 8%, transparent)',
            color: 'var(--err)',
            fontSize: 11,
          }}
        >
          <p style={{ margin: 0, fontWeight: 500 }}>Could not load conversations</p>
          <p style={{ margin: '4px 0 0' }}>{loadError}</p>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <div className="rail-section-label">
            <span>Active</span>
            <span>{active.length}</span>
          </div>
          <div className="rail-list">
            {active.map((c) => (
              <RailItem key={c.id} c={c} active={pathname === `/conversations/${c.id}`} />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="rail-section-label">
            <span>Recent</span>
            <span>{recent.length}</span>
          </div>
          <div className="rail-list">
            {recent.map((c) => (
              <RailItem key={c.id} c={c} active={pathname === `/conversations/${c.id}`} />
            ))}
          </div>
        </div>
      )}

      {loadError === null && items.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12, padding: '0 8px' }}>
          No conversations yet. Start a new review.
        </p>
      )}

      <div className="rail-footer">
        <div className="usage-label">
          <span>Quota · monthly</span>
          <strong>62%</strong>
        </div>
        <div className="usage-bar">
          <div style={{ width: '62%' }} />
        </div>
        <div className="usage-label">
          <span>2.4M / 4M tokens</span>
          <span>resets in 6 days</span>
        </div>
      </div>
    </aside>
  );
}

function RailItem({ c, active }: { c: ConversationSummary; active: boolean }) {
  const tag = statusTag(c.status);
  return (
    <Link
      href={`/conversations/${c.id}`}
      className={'rail-item' + (active ? ' active' : '')}
      aria-current={active ? 'page' : undefined}
    >
      <span className="title">{c.title}</span>
      <span className="meta">
        <span>{formatRelative(c.lastMessageAt)}</span>
        <span className="dot" />
        <span>{c.messageCount} msg</span>
        {tag !== null && (
          <>
            <span className="dot" />
            <span className="rail-tag">{tag}</span>
          </>
        )}
      </span>
    </Link>
  );
}

