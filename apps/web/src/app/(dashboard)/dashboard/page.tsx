import Link from 'next/link';
import type { DashboardSummaryResponse, DashboardTimeRange } from '@olives/types';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { SummaryCards } from '@/components/dashboard/summary-cards';

export const dynamic = 'force-dynamic';

const RANGE_OPTIONS: ReadonlyArray<{ label: string; value: DashboardTimeRange }> = [
  { label: 'Last hour', value: '1h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
];

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

function parseRange(raw: string | undefined): DashboardTimeRange {
  if (raw === '1h' || raw === '24h' || raw === '7d' || raw === '30d') return raw;
  return '24h';
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Inference activity across all conversations and ingestion sources.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={{ pathname: '/dashboard', query: { range: opt.value } }}
              className={
                'rounded-md border px-3 py-1.5 text-xs ' +
                (range === opt.value
                  ? 'bg-foreground text-background'
                  : 'hover:bg-accent text-muted-foreground')
              }
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {loadError !== null || summary === null ? (
        <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not load dashboard summary</p>
          <p className="mt-1 text-xs">{loadError ?? 'Unknown error'}</p>
          <p className="mt-2 text-xs">
            Check that the api is reachable and `/health/ready` returns ok.
          </p>
        </Card>
      ) : (
        <>
          <SummaryCards summary={summary} />

          <div>
            <h2 className="mb-2 text-lg font-semibold">Provider / model breakdown</h2>
            {summary.providerBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No requests in this window yet. Send a chat message and refresh.
              </p>
            ) : (
              <Card className="divide-y p-0">
                {summary.providerBreakdown.map((b) => (
                  <div
                    key={`${b.provider}::${b.model}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="text-sm">
                      <span className="font-medium">{b.provider}</span>
                      <span className="text-muted-foreground"> · {b.model}</span>
                    </div>
                    <span className="text-sm tabular-nums">{b.count}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            Showing data from the {range} window. Drill into individual requests on the{' '}
            <Link href="/dashboard/requests" className="underline">
              Requests
            </Link>{' '}
            page.
          </p>
        </>
      )}
    </div>
  );
}
