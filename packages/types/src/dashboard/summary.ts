import { z } from 'zod';

export const dashboardTimeRangeSchema = z.enum(['1h', '24h', '7d', '30d']);
export type DashboardTimeRange = z.infer<typeof dashboardTimeRangeSchema>;

export const dashboardSummaryQuerySchema = z.object({
  range: dashboardTimeRangeSchema.default('24h'),
});
export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;

export const dashboardSummaryResponseSchema = z.object({
  range: dashboardTimeRangeSchema,
  requestCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  failureCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  p50LatencyMs: z.number().int().nullable(),
  p95LatencyMs: z.number().int().nullable(),
  tokenUsage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
  providerBreakdown: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type DashboardSummaryResponse = z.infer<typeof dashboardSummaryResponseSchema>;
