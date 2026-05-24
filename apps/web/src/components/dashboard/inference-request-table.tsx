'use client';

import { useMemo, useState } from 'react';
import type { DashboardInferenceRequestSummary } from '@olives/types';
import { Icon } from '@/components/layout/icon';

interface Props {
  items: DashboardInferenceRequestSummary[];
}

type FilterKey = 'all' | 'completed' | 'failed' | 'anthropic' | 'openai' | 'google' | 'deepseek';

const FILTER_KEYS: ReadonlyArray<FilterKey> = [
  'all',
  'completed',
  'failed',
  'anthropic',
  'openai',
  'google',
  'deepseek',
];

function formatStarted(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLatency(ms: number | null): string {
  return ms === null ? '—' : `${ms.toLocaleString()} ms`;
}

function preview(r: DashboardInferenceRequestSummary): string {
  if (r.outputPreview !== null && r.outputPreview.length > 0) return r.outputPreview;
  if (r.inputPreview !== null && r.inputPreview.length > 0) return r.inputPreview;
  return '—';
}

function statusClass(status: DashboardInferenceRequestSummary['status']): string {
  if (status === 'failed') return 'err';
  if (status === 'completed') return 'ok';
  return 'warn';
}

function matchesFilter(
  r: DashboardInferenceRequestSummary,
  filters: ReadonlySet<FilterKey>,
): boolean {
  if (filters.has('all')) return true;
  const statusMatch =
    (filters.has('completed') && r.status === 'completed') ||
    (filters.has('failed') && r.status === 'failed');
  const providerMatch =
    (filters.has('anthropic') && r.provider === 'anthropic') ||
    (filters.has('openai') && r.provider === 'openai') ||
    (filters.has('google') && r.provider === 'google') ||
    (filters.has('deepseek') && r.provider === 'deepseek');

  const anyStatusActive = filters.has('completed') || filters.has('failed');
  const anyProviderActive =
    filters.has('anthropic') ||
    filters.has('openai') ||
    filters.has('google') ||
    filters.has('deepseek');

  if (anyStatusActive && anyProviderActive) return statusMatch && providerMatch;
  if (anyStatusActive) return statusMatch;
  if (anyProviderActive) return providerMatch;
  return true;
}

export function InferenceRequestTable({ items }: Props) {
  const firstId = items.length > 0 ? items[0]?.id ?? null : null;
  const [open, setOpen] = useState<string | null>(firstId);
  const [filters, setFilters] = useState<ReadonlySet<FilterKey>>(new Set<FilterKey>(['all']));

  const list = useMemo(() => items.filter((r) => matchesFilter(r, filters)), [items, filters]);

  function toggleFilter(k: FilterKey) {
    const next = new Set(filters);
    if (k === 'all') {
      setFilters(new Set<FilterKey>(['all']));
      return;
    }
    next.delete('all');
    if (next.has(k)) next.delete(k);
    else next.add(k);
    if (next.size === 0) next.add('all');
    setFilters(next);
  }

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No inference requests recorded yet.</p>
    );
  }

  return (
    <>
      <div className="filterbar">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginRight: 4,
          }}
        >
          Filter
        </span>
        {FILTER_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={filters.has(k)}
            onClick={() => toggleFilter(k)}
          >
            {filters.has(k) && k !== 'all' && <Icon name="check" size={11} />}
            {k}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Provider · model</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Latency</th>
              <th style={{ textAlign: 'right' }}>In · out</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                expanded={open === r.id}
                onToggle={() => setOpen(open === r.id ? null : r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="foot-note">
        Showing {list.length} of {items.length} requests. Older requests stored 90 days.
      </p>
    </>
  );
}

interface RowProps {
  r: DashboardInferenceRequestSummary;
  expanded: boolean;
  onToggle(): void;
}

function RequestRow({ r, expanded, onToggle }: RowProps) {
  const inTokens = r.inputTokens ?? 0;
  const outTokens = r.outputTokens ?? 0;
  const cost = inTokens * 0.000003 + outTokens * 0.000015;
  const cls = statusClass(r.status);
  const statusLabel = r.status === 'failed' ? 'failed' : r.status === 'completed' ? 'completed' : r.status;

  return (
    <>
      <tr className={expanded ? 'expanded' : undefined} onClick={onToggle}>
        <td className="started">{formatStarted(r.requestStartedAt)}</td>
        <td>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{r.provider}</span>
          <span style={{ color: 'var(--muted)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
            · {r.model}
          </span>
        </td>
        <td>
          <span className={`status-pill ${cls}`}>{statusLabel}</span>
        </td>
        <td className="num" style={{ textAlign: 'right' }}>
          {formatLatency(r.latencyMs)}
        </td>
        <td className="num" style={{ textAlign: 'right' }}>
          {inTokens} · {outTokens}
        </td>
        <td className="preview">{preview(r)}</td>
      </tr>
      {expanded && (
        <tr className="expansion">
          <td colSpan={6}>
            <div className="expansion-inner">
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'var(--muted)',
                    marginBottom: 12,
                  }}
                >
                  Timeline
                </div>
                <div className="timeline">
                  <TimelineItem
                    t="+0 ms"
                    title="request.created"
                    sub={`route: /v1/messages · ${r.provider}`}
                  />
                  <TimelineItem
                    t="+18 ms"
                    title="risk.classified"
                    sub="peril candidate — outbound tool call detected"
                  />
                  <TimelineItem
                    t="+22 ms"
                    title="provider.dispatched"
                    sub={`${r.provider} · ${r.model}`}
                  />
                  {r.timeToFirstTokenMs !== null && (
                    <TimelineItem
                      t={`+${r.timeToFirstTokenMs.toLocaleString()} ms`}
                      title="tokens.streaming"
                      sub={`first token`}
                    />
                  )}
                  <TimelineItem
                    t={`+${r.latencyMs?.toLocaleString() ?? '?'} ms`}
                    title={r.status === 'failed' ? 'request.failed' : 'request.completed'}
                    sub={r.status === 'failed' ? 'see error metadata' : 'ok'}
                  />
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'var(--muted)',
                    marginBottom: 12,
                  }}
                >
                  Metadata
                </div>
                <dl className="kv">
                  <dt>id</dt>
                  <dd>{r.id}</dd>
                  <dt>provider</dt>
                  <dd>{r.provider}</dd>
                  <dt>model</dt>
                  <dd>{r.model}</dd>
                  <dt>tokens in</dt>
                  <dd>{r.inputTokens ?? '—'}</dd>
                  <dt>tokens out</dt>
                  <dd>{r.outputTokens ?? '—'}</dd>
                  <dt>cost</dt>
                  <dd>${cost.toFixed(4)}</dd>
                  <dt>started</dt>
                  <dd>{formatStarted(r.requestStartedAt)}</dd>
                </dl>
                <div className="row" style={{ marginTop: 16 }}>
                  <button type="button" className="btn btn-ghost btn-sm">
                    <Icon name="external" size={12} /> Open replay
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm">
                    <Icon name="copy" size={12} /> Copy as cURL
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TimelineItem({ t, title, sub }: { t: string; title: string; sub: string }) {
  return (
    <div className="timeline-item">
      <span className="timeline-time">{t}</span>
      <span className="timeline-dot" />
      <div className="timeline-body">
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}
