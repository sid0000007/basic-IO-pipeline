import Link from 'next/link';
import type { ListInferenceRequestsResponse } from '@olives/types';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Inference requests</h1>
        <p className="text-muted-foreground text-sm">
          Most recent first. Click a row for the full event timeline.
        </p>
      </div>

      {loadError !== null || res === null ? (
        <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not load requests</p>
          <p className="mt-1 text-xs">{loadError ?? 'Unknown error'}</p>
        </Card>
      ) : (
        <>
          <InferenceRequestTable items={res.items} />
          {res.nextCursor !== null && (
            <p className="text-muted-foreground text-xs">
              More pages exist. Pagination UI is a Phase 4 enhancement; for now the cursor token is{' '}
              <Link
                href={`/dashboard/requests?cursor=${encodeURIComponent(res.nextCursor)}`}
                className="underline"
              >
                next page →
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
