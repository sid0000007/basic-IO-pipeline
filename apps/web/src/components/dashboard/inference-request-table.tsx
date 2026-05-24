import Link from 'next/link';
import type { DashboardInferenceRequestSummary } from '@olives/types';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props {
  items: DashboardInferenceRequestSummary[];
}

function badgeVariantForStatus(
  status: DashboardInferenceRequestSummary['status'],
): 'default' | 'secondary' | 'destructive' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

function formatLatency(ms: number | null): string {
  return ms === null ? '—' : `${ms} ms`;
}

function formatTokens(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function InferenceRequestTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No inference requests recorded yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>Provider / model</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Latency</TableHead>
          <TableHead className="text-right">In tokens</TableHead>
          <TableHead className="text-right">Out tokens</TableHead>
          <TableHead>Preview</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-xs">
              <Link href={`/dashboard/requests/${r.id}`} className="underline">
                {new Date(r.requestStartedAt).toLocaleString()}
              </Link>
            </TableCell>
            <TableCell className="text-xs">
              <span className="font-medium">{r.provider}</span>
              <span className="text-muted-foreground"> · {r.model}</span>
            </TableCell>
            <TableCell>
              <Badge variant={badgeVariantForStatus(r.status)}>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums">
              {formatLatency(r.latencyMs)}
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums">
              {formatTokens(r.inputTokens)}
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums">
              {formatTokens(r.outputTokens)}
            </TableCell>
            <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
              {r.outputPreview ?? r.inputPreview ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
