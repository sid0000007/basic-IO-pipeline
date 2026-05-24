import Link from 'next/link';
import type { DashboardInferenceRequestDetail } from '@olives/types';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { InferenceRequestDetail } from '@/components/dashboard/inference-request-detail';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InferenceRequestPage({ params }: Props) {
  const { id } = await params;

  let request: DashboardInferenceRequestDetail | null = null;
  let loadError: string | null = null;
  try {
    request = await api.getInferenceRequest(id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Request not found';
  }

  if (request === null) {
    return (
      <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">Could not load inference request {id}</p>
        <p className="mt-1 text-xs">{loadError ?? 'Unknown error'}</p>
        <Link href="/dashboard/requests" className="mt-2 inline-block text-xs underline">
          Back to requests
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/requests" className="text-muted-foreground text-xs hover:underline">
        ← All requests
      </Link>
      <InferenceRequestDetail request={request} />
    </div>
  );
}
