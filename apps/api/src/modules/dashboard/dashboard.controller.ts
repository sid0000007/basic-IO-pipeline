import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  type DashboardInferenceRequestDetail,
  type DashboardSummaryQuery,
  type DashboardSummaryResponse,
  type ListInferenceRequestsQuery,
  type ListInferenceRequestsResponse,
  dashboardSummaryQuerySchema,
  listInferenceRequestsQuerySchema,
} from '@olives/types';
import { ZodQuery } from '../../common/decorators/zod-query.decorator';
import { DashboardService } from './dashboard.service';

@SkipThrottle()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(
    @ZodQuery(dashboardSummaryQuerySchema) query: DashboardSummaryQuery,
  ): Promise<DashboardSummaryResponse> {
    return this.dashboard.summary(query);
  }

  @Get('inference-requests')
  list(
    @ZodQuery(listInferenceRequestsQuerySchema) query: ListInferenceRequestsQuery,
  ): Promise<ListInferenceRequestsResponse> {
    return this.dashboard.list(query);
  }

  @Get('inference-requests/:id')
  detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<DashboardInferenceRequestDetail> {
    return this.dashboard.detail(id);
  }
}
