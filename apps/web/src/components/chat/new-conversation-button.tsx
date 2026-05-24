'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/layout/icon';
import { api } from '@/lib/api-client';

export function NewConversationButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const conv = await api.createConversation({});
      router.push(`/conversations/${conv.id}`);
      router.refresh();
    } catch (err) {
      console.error('Failed to create conversation', err);
      setPending(false);
    }
  }

  return (
    <button type="button" className="rail-new" onClick={handleClick} disabled={pending}>
      <span>{pending ? 'Creating…' : 'New review'}</span>
      <span className="plus">
        <Icon name="plus" size={16} />
      </span>
    </button>
  );
}
