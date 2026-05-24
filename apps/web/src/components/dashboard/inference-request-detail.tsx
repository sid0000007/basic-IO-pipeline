import type { DashboardInferenceRequestDetail } from '@olives/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface Props {
  request: DashboardInferenceRequestDetail;
}

function formatLatency(ms: number | null): string {
  return ms === null ? '—' : `${ms} ms`;
}

function formatTokens(n: number | null): string {
  return n === null ? '—' : String(n);
}

function badgeVariantForStatus(
  status: DashboardInferenceRequestDetail['status'],
): 'default' | 'secondary' | 'destructive' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

export function InferenceRequestDetail({ request }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{request.provider}</h1>
        <span className="text-muted-foreground">·</span>
        <span className="font-mono text-sm">{request.model}</span>
        <Badge variant={badgeVariantForStatus(request.status)}>{request.status}</Badge>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Started" value={new Date(request.requestStartedAt).toLocaleString()} />
        <Stat
          label="Completed"
          value={
            request.completedAt !== null ? new Date(request.completedAt).toLocaleString() : '—'
          }
        />
        <Stat label="Latency" value={formatLatency(request.latencyMs)} />
        <Stat label="Time to first token" value={formatLatency(request.timeToFirstTokenMs)} />
        <Stat label="Input tokens" value={formatTokens(request.inputTokens)} />
        <Stat label="Output tokens" value={formatTokens(request.outputTokens)} />
        <Stat label="Total tokens" value={formatTokens(request.totalTokens)} />
        <Stat label="Session" value={request.sessionId} mono />
      </Card>

      {(request.errorCode !== null || request.errorMessage !== null) && (
        <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Error</p>
          {request.errorCode !== null && (
            <p className="mt-1 text-xs">
              <span className="font-medium">Code:</span> {request.errorCode}
            </p>
          )}
          {request.errorMessage !== null && <p className="mt-1 text-xs">{request.errorMessage}</p>}
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">Input preview</h2>
          <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">
            {request.inputPreview ?? '—'}
          </p>
        </div>
        <Separator />
        <div>
          <h2 className="text-sm font-semibold">Output preview</h2>
          <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">
            {request.outputPreview ?? '—'}
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Event timeline</h2>
        {request.events.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">
            No events recorded yet. The worker may not have processed this request&apos;s ingestion
            job yet.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2">
            {request.events.map((e) => (
              <li key={e.id} className="border-l-2 pl-3 text-xs">
                <p className="font-medium">{e.eventType}</p>
                <p className="text-muted-foreground">
                  {new Date(e.eventTimestamp).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className={'mt-0.5 text-sm ' + (mono === true ? 'font-mono' : '')}>{value}</p>
    </div>
  );
}
