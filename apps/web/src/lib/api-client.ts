import {
  cancelInferenceResponseSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  createConversationRequestSchema,
  dashboardInferenceRequestDetailSchema,
  dashboardSummaryResponseSchema,
  listConversationsResponseSchema,
  listInferenceRequestsResponseSchema,
  postMessageRequestSchema,
  postMessageResponseSchema,
  type CancelInferenceResponse,
  type ConversationDetail,
  type ConversationSummary,
  type CreateConversationRequest,
  type DashboardInferenceRequestDetail,
  type DashboardSummaryResponse,
  type DashboardTimeRange,
  type ListConversationsQuery,
  type ListConversationsResponse,
  type ListInferenceRequestsQuery,
  type ListInferenceRequestsResponse,
  type PostMessageRequest,
  type PostMessageResponse,
} from '@olives/types';

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

interface ParserLike<T> {
  parse(input: unknown): T;
}

async function request<T>(path: string, init: RequestInit, parser: ParserLike<T>): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  const json: unknown = await res.json();
  return parser.parse(json);
}

export const api = {
  createConversation(body: CreateConversationRequest): Promise<ConversationSummary> {
    const parsed = createConversationRequestSchema.parse(body);
    return request(
      '/chat/conversations',
      { method: 'POST', body: JSON.stringify(parsed) },
      conversationSummarySchema,
    );
  },

  listConversations(
    query: Partial<ListConversationsQuery> = {},
  ): Promise<ListConversationsResponse> {
    const params = new URLSearchParams();
    if (query.cursor !== undefined) params.set('cursor', query.cursor);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.status !== undefined) params.set('status', query.status);
    const qs = params.toString();
    return request(
      `/chat/conversations${qs.length > 0 ? `?${qs}` : ''}`,
      { method: 'GET' },
      listConversationsResponseSchema,
    );
  },

  getConversation(id: string): Promise<ConversationDetail> {
    return request(`/chat/conversations/${id}`, { method: 'GET' }, conversationDetailSchema);
  },

  postMessage(conversationId: string, body: PostMessageRequest): Promise<PostMessageResponse> {
    const parsed = postMessageRequestSchema.parse(body);
    return request(
      `/chat/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify(parsed) },
      postMessageResponseSchema,
    );
  },

  cancelInference(inferenceRequestId: string): Promise<CancelInferenceResponse> {
    return request(
      `/chat/inferences/${inferenceRequestId}/cancel`,
      { method: 'POST', body: '{}' },
      cancelInferenceResponseSchema,
    );
  },

  sseStreamUrl(conversationId: string, inferenceRequestId: string): string {
    return `${BASE}/api/v1/chat/conversations/${conversationId}/stream/${inferenceRequestId}`;
  },

  dashboardSummary(range: DashboardTimeRange = '24h'): Promise<DashboardSummaryResponse> {
    return request(
      `/dashboard/summary?range=${range}`,
      { method: 'GET' },
      dashboardSummaryResponseSchema,
    );
  },

  listInferenceRequests(
    query: Partial<ListInferenceRequestsQuery> = {},
  ): Promise<ListInferenceRequestsResponse> {
    const params = new URLSearchParams();
    if (query.provider !== undefined) params.set('provider', query.provider);
    if (query.model !== undefined) params.set('model', query.model);
    if (query.status !== undefined) params.set('status', query.status);
    if (query.from !== undefined) params.set('from', query.from);
    if (query.to !== undefined) params.set('to', query.to);
    if (query.cursor !== undefined) params.set('cursor', query.cursor);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return request(
      `/dashboard/inference-requests${qs.length > 0 ? `?${qs}` : ''}`,
      { method: 'GET' },
      listInferenceRequestsResponseSchema,
    );
  },

  getInferenceRequest(id: string): Promise<DashboardInferenceRequestDetail> {
    return request(
      `/dashboard/inference-requests/${id}`,
      { method: 'GET' },
      dashboardInferenceRequestDetailSchema,
    );
  },
};
