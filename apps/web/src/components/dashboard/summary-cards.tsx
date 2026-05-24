import type { DashboardSummaryResponse } from '@olives/types';
import { Card } from '@/components/ui/card';

interface Props {
  summary: DashboardSummaryResponse;
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatLatency(v: number | null): string {
  return v === null ? '—' : `${v} ms`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function SummaryCards({ summary }: Props) {
  const totalTokens = summary.tokenUsage.input + summary.tokenUsage.output;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Requests" value={String(summary.requestCount)} />
      <Stat
        label="Success rate"
        value={formatPercent(summary.successRate)}
        sub={`${summary.failureCount} failed · ${summary.cancelledCount} cancelled`}
      />
      <Stat
        label="Latency"
        value={formatLatency(summary.p95LatencyMs)}
        sub={`p50 ${formatLatency(summary.p50LatencyMs)}`}
      />
      <Stat
        label="Tokens"
        value={formatTokens(totalTokens)}
        sub={`in ${formatTokens(summary.tokenUsage.input)} · out ${formatTokens(summary.tokenUsage.output)}`}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub !== undefined && <p className="text-muted-foreground text-xs">{sub}</p>}
    </Card>
  );
}
