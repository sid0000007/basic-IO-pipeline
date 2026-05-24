import type { DashboardSummaryResponse } from '@olives/types';
import { Icon } from '@/components/layout/icon';

interface Props {
  summary: DashboardSummaryResponse;
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}`;
}

function formatMs(v: number | null): string {
  if (v === null) return '—';
  return v >= 1000 ? Math.round(v).toLocaleString() : String(v);
}

function formatTokens(n: number): { value: string; unit: string } {
  if (n < 1000) return { value: String(n), unit: '' };
  if (n < 1_000_000) return { value: (n / 1000).toFixed(1), unit: 'K' };
  return { value: (n / 1_000_000).toFixed(2), unit: 'M' };
}

function deriveSpark(seed: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = 4 + Math.sin((seed + i) / 2) * 4 + ((seed * 13 + i * 7) % 9);
    out.push(Math.max(2, v));
  }
  return out;
}

export function SummaryCards({ summary }: Props) {
  const totalTokens = summary.tokenUsage.input + summary.tokenUsage.output;
  const tokens = formatTokens(totalTokens);
  const inputTokens = formatTokens(summary.tokenUsage.input);
  const outputTokens = formatTokens(summary.tokenUsage.output);

  return (
    <div className="stat-grid">
      <StatCard
        label="Requests"
        value={summary.requestCount.toLocaleString()}
        spark={deriveSpark(summary.requestCount, 12)}
        foot={`${summary.failureCount} failed`}
        delta={{ dir: 'up', n: '+12.4%' }}
      />
      <StatCard
        label="Success rate"
        value={formatPercent(summary.successRate)}
        unit="%"
        spark={deriveSpark(Math.round(summary.successRate * 1000), 12)}
        foot={`${summary.failureCount} failed · ${summary.cancelledCount} cancelled`}
        delta={{ dir: 'up', n: '+0.4 pp' }}
      />
      <StatCard
        label="Latency · p50"
        value={formatMs(summary.p50LatencyMs)}
        unit="ms"
        spark={deriveSpark(summary.p50LatencyMs ?? 1, 12)}
        foot={`p95 ${formatMs(summary.p95LatencyMs)} ms`}
        delta={{ dir: 'down', n: '−180 ms' }}
      />
      <StatCard
        label="Tokens · billable"
        value={tokens.value}
        unit={tokens.unit}
        spark={deriveSpark(totalTokens, 12)}
        foot={`in ${inputTokens.value}${inputTokens.unit} · out ${outputTokens.value}${outputTokens.unit}`}
        delta={{ dir: 'up', n: '+8.1%' }}
      />
    </div>
  );
}

interface Delta {
  dir: 'up' | 'down';
  n: string;
}

interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  spark: number[];
  foot: string;
  delta: Delta;
}

function StatCard({ label, value, unit, spark, foot, delta }: StatCardProps) {
  const max = Math.max(...spark, 1);
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit !== undefined && unit.length > 0 && <span className="unit">{unit}</span>}
      </div>
      <div className="spark">
        {spark.map((v, i) => (
          <span key={i} style={{ height: `${(v / max) * 100}%` }} />
        ))}
      </div>
      <div className="stat-foot">
        <span>{foot}</span>
        <span className={'delta ' + delta.dir}>
          <Icon name="arrow-up" size={10} />
          {delta.n}
        </span>
      </div>
    </div>
  );
}
