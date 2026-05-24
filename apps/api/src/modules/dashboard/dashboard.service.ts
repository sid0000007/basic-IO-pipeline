import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  DashboardInferenceRequestDetail,
  DashboardInferenceRequestSummary,
  DashboardSummaryQuery,
  DashboardSummaryResponse,
  DashboardTimeRange,
  ListInferenceRequestsQuery,
  ListInferenceRequestsResponse,
} from '@olives/types';
import { PrismaService } from '../../prisma/prisma.service';

const RANGE_MS: Record<DashboardTimeRange, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

interface SummaryRow {
  request_count: number;
  completed_count: number;
  failed_count: number;
  cancelled_count: number;
  p50: number | null;
  p95: number | null;
  input_tokens: bigint;
  output_tokens: bigint;
}

interface ProviderBreakdownRow {
  provider: string;
  model: string;
  count: number;
}

interface CursorPosition {
  startedAt: Date;
  id: string;
}

function encodeCursor(p: CursorPosition): string {
  return Buffer.from(`${p.startedAt.toISOString()}|${p.id}`).toString('base64url');
}

function decodeCursor(s: string): CursorPosition | null {
  try {
    const decoded = Buffer.from(s, 'base64url').toString('utf8');
    const sep = decoded.indexOf('|');
    if (sep === -1) return null;
    const startedAt = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(startedAt.getTime()) || id.length === 0) return null;
    return { startedAt, id };
  } catch {
    return null;
  }
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: DashboardSummaryQuery): Promise<DashboardSummaryResponse> {
    const cutoff = new Date(Date.now() - RANGE_MS[query.range]);

    const summaryRows = await this.prisma.$queryRaw<SummaryRow[]>`
      SELECT
        count(*)::int AS request_count,
        count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        count(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95,
        coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
        coalesce(sum(output_tokens), 0)::bigint AS output_tokens
      FROM inference_requests
      WHERE request_started_at >= ${cutoff}
    `;

    const row = summaryRows[0] ?? {
      request_count: 0,
      completed_count: 0,
      failed_count: 0,
      cancelled_count: 0,
      p50: null,
      p95: null,
      input_tokens: BigInt(0),
      output_tokens: BigInt(0),
    };

    const breakdownRows = await this.prisma.$queryRaw<ProviderBreakdownRow[]>`
      SELECT provider, model, count(*)::int AS count
      FROM inference_requests
      WHERE request_started_at >= ${cutoff}
      GROUP BY provider, model
      ORDER BY count DESC, provider, model
    `;

    const successRate = row.request_count > 0 ? row.completed_count / row.request_count : 0;

    return {
      range: query.range,
      requestCount: row.request_count,
      successRate,
      failureCount: row.failed_count,
      cancelledCount: row.cancelled_count,
      p50LatencyMs: row.p50,
      p95LatencyMs: row.p95,
      tokenUsage: {
        input: Number(row.input_tokens),
        output: Number(row.output_tokens),
      },
      providerBreakdown: breakdownRows.map((b) => ({
        provider: b.provider,
        model: b.model,
        count: b.count,
      })),
    };
  }

  async list(query: ListInferenceRequestsQuery): Promise<ListInferenceRequestsResponse> {
    const cursor = query.cursor !== undefined ? decodeCursor(query.cursor) : null;

    const where: Prisma.InferenceRequestWhereInput = {
      ...(query.provider !== undefined && { provider: query.provider }),
      ...(query.model !== undefined && { model: query.model }),
      ...(query.status !== undefined && { status: query.status }),
      ...((query.from !== undefined || query.to !== undefined) && {
        requestStartedAt: {
          ...(query.from !== undefined && { gte: new Date(query.from) }),
          ...(query.to !== undefined && { lte: new Date(query.to) }),
        },
      }),
      ...(cursor !== null && {
        OR: [
          { requestStartedAt: { lt: cursor.startedAt } },
          { requestStartedAt: cursor.startedAt, id: { lt: cursor.id } },
        ],
      }),
    };

    const rows = await this.prisma.inferenceRequest.findMany({
      where,
      orderBy: [{ requestStartedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const items: DashboardInferenceRequestSummary[] = pageRows.map(toSummary);

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = pageRows[pageRows.length - 1];
      if (last !== undefined) {
        nextCursor = encodeCursor({ startedAt: last.requestStartedAt, id: last.id });
      }
    }

    return { items, nextCursor };
  }

  async detail(id: string): Promise<DashboardInferenceRequestDetail> {
    const row = await this.prisma.inferenceRequest.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { eventTimestamp: 'asc' },
        },
      },
    });
    if (row === null) {
      throw new NotFoundException(`Inference request ${id} not found`);
    }
    return {
      ...toSummary(row),
      events: row.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        eventTimestamp: e.eventTimestamp.toISOString(),
        payload: toJsonRecord(e.payload),
      })),
    };
  }
}

interface InferenceRequestRow {
  id: string;
  conversationId: string;
  sessionId: string;
  provider: string;
  model: string;
  status: 'queued' | 'started' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  requestStartedAt: Date;
  completedAt: Date | null;
  latencyMs: number | null;
  timeToFirstTokenMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  inputPreview: string | null;
  outputPreview: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

function toSummary(row: InferenceRequestRow): DashboardInferenceRequestSummary {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sessionId: row.sessionId,
    provider: row.provider,
    model: row.model,
    status: row.status,
    requestStartedAt: row.requestStartedAt.toISOString(),
    completedAt: row.completedAt !== null ? row.completedAt.toISOString() : null,
    latencyMs: row.latencyMs,
    timeToFirstTokenMs: row.timeToFirstTokenMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    inputPreview: row.inputPreview,
    outputPreview: row.outputPreview,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

function toJsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    out[k] = value[k];
  }
  return out;
}
