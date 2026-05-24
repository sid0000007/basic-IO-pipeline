import type { ListInferenceRequestsResponse } from '@olives/types';
import { api } from '@/lib/api-client';
import { Icon } from '@/components/layout/icon';
import { InferenceRequestTable } from '@/components/dashboard/inference-request-table';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  let res: ListInferenceRequestsResponse | null = null;
  let loadError: string | null = null;
  try {
    res = await api.listInferenceRequests({ limit: 50 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load requests';
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inference log</h1>
          <p>
            Every model call routed through Olives. Click a row for the full event timeline —
            the same one our underwriters see.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm">
            <Icon name="filter" size={13} /> Filters
          </button>
          <button type="button" className="btn btn-ghost btn-sm">
            <Icon name="download" size={13} /> Export CSV
          </button>
        </div>
      </div>

      {loadError !== null || res === null ? (
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
          <p style={{ margin: 0, fontWeight: 500 }}>Could not load requests</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>{loadError ?? 'Unknown error'}</p>
        </div>
      ) : (
        <InferenceRequestTable items={res.items} />
      )}
    </div>
  );
}
