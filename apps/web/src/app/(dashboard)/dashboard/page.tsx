import Link from 'next/link';
import type { DashboardSummaryResponse, DashboardTimeRange } from '@olives/types';
import { api } from '@/lib/api-client';
import { Icon } from '@/components/layout/icon';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { RequestsChart } from '@/components/dashboard/requests-chart';

export const dynamic = 'force-dynamic';

const RANGES: ReadonlyArray<DashboardTimeRange> = ['1h', '24h', '7d', '30d'];

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

function parseRange(raw: string | undefined): DashboardTimeRange {
  if (raw === '1h' || raw === '24h' || raw === '7d' || raw === '30d') return raw;
  return '24h';
}

const ACCENT_PALETTE: ReadonlyArray<string> = [
  'var(--accent)',
  'var(--text)',
  'var(--text-2)',
  'var(--muted-2)',
];

const RISK_ROWS: ReadonlyArray<{ k: string; v: number; n: number }> = [
  { k: 'A · Hallucination', v: 6.2, n: 916 },
  { k: 'B · Prompt injection', v: 3.1, n: 459 },
  { k: 'C · Training-set', v: 0.8, n: 118 },
  { k: 'E · Agent action', v: 11.4, n: 1687 },
  { k: 'F · Bias / fairness', v: 0.4, n: 59 },
];

const FLAGGED: ReadonlyArray<{ t: string; title: string; peril: string }> = [
  { t: '6:09:29 PM', title: 'Possible PII in user prompt', peril: 'B' },
  { t: '5:48:02 PM', title: 'Agent attempted external write', peril: 'E' },
  { t: '5:21:18 PM', title: 'Latency outlier · 14.2s', peril: '—' },
  { t: '4:55:00 PM', title: 'Model deprecation notice (3p)', peril: 'D' },
];

function syntheticChart(): number[] {
  const out: number[] = [];
  for (let i = 0; i < 48; i += 1) {
    const base = 30 + Math.sin(i / 6) * 14 + Math.sin(i / 3) * 6;
    out.push(Math.max(4, base + ((i * 17) % 9) - 4));
  }
  return out;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = parseRange(params.range);

  let summary: DashboardSummaryResponse | null = null;
  let loadError: string | null = null;
  try {
    summary = await api.dashboardSummary(range);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load summary';
  }

  const providerRows =
    summary === null
      ? []
      : (() => {
          const totalProvider =
            summary.providerBreakdown.reduce((acc, b) => acc + b.count, 0) || 1;
          return summary.providerBreakdown.map((b, i) => ({
            name: b.provider,
            model: b.model,
            count: b.count,
            weight: Math.round((b.count / totalProvider) * 100),
            color: ACCENT_PALETTE[i % ACCENT_PALETTE.length],
          }));
        })();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Telemetry</h1>
          <p>
            Continuous underwriting signal across every conversation, agent run, and ingestion
            source connected to Olives.
          </p>
        </div>
        <div className="range">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={{ pathname: '/dashboard', query: { range: r } }}
              aria-pressed={range === r}
            >
              {r}
            </Link>
          ))}
        </div>
      </div>

      {loadError !== null || summary === null ? (
        <div
          style={{
            padding: 16,
            border: '1px solid color-mix(in oklch, var(--err) 30%, transparent)',
            background: 'color-mix(in oklch, var(--err) 8%, transparent)',
            color: 'var(--err)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
          }}
        >
          <p style={{ margin: 0, fontWeight: 500 }}>Could not load telemetry summary</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>{loadError ?? 'Unknown error'}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12 }}>
            Check that the api is reachable and <code>/health/ready</code> returns ok.
          </p>
        </div>
      ) : (
        <>
          <SummaryCards summary={summary} />

          <div className="panel-grid">
            <div className="panel">
              <div className="panel-head">
                <h3>Request volume</h3>
                <span className="meta">last 24h · 5-minute buckets</span>
              </div>
              <div className="panel-body">
                <RequestsChart data={syntheticChart()} meta={`window ${range}`} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3>Provider mix</h3>
                <span className="meta">by request</span>
              </div>
              <div className="panel-body">
                {providerRows.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
                    No requests in this window yet. Send a chat message and refresh.
                  </p>
                ) : (
                  <div className="provider-list">
                    {providerRows.map((r) => (
                      <div className="provider-row" key={`${r.name}::${r.model}`}>
                        <div className="provider-name">
                          <span className="swatch" style={{ background: r.color }} />
                          {r.name}
                          <span className="model">· {r.model}</span>
                        </div>
                        <div className="provider-count">
                          {r.count.toLocaleString()}{' '}
                          <span style={{ color: 'var(--muted)' }}>· {r.weight}%</span>
                        </div>
                        <div className="provider-bar">
                          <div
                            style={{
                              width: `${r.weight}%`,
                              background: r.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="divider" />

          <div className="panel-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Risk-classified calls</h3>
                <span className="meta">last 24h</span>
              </div>
              <div className="panel-body">
                <div className="provider-list">
                  {RISK_ROWS.map((r) => (
                    <div className="provider-row" key={r.k}>
                      <div className="provider-name">
                        <span
                          className="swatch"
                          style={{ background: 'var(--accent)' }}
                        />
                        {r.k}
                      </div>
                      <div className="provider-count">
                        {r.n.toLocaleString()}{' '}
                        <span style={{ color: 'var(--muted)' }}>· {r.v}%</span>
                      </div>
                      <div className="provider-bar">
                        <div style={{ width: `${r.v * 8}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3>Recent flagged events</h3>
                <span className="meta">threshold &gt; 0.6</span>
              </div>
              <div className="panel-body">
                {FLAGGED.map((r) => (
                  <div
                    key={r.title}
                    className="provider-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 14,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                        {r.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--muted)',
                          fontFamily: 'var(--font-mono)',
                          marginTop: 2,
                        }}
                      >
                        {r.t} · Peril {r.peril}
                      </div>
                    </div>
                    <Link href="/dashboard/requests" className="btn btn-quiet btn-sm">
                      Investigate <Icon name="arrow" size={11} />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="foot-note">
            Showing live data from the {range} window. Drill into individual requests on the{' '}
            <Link href="/dashboard/requests">Inference Log</Link>.
          </p>
        </>
      )}
    </div>
  );
}
