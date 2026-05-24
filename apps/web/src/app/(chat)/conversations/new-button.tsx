'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export function NewConversationButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const conv = await api.createConversation({});
      router.push(`/conversations/${conv.id}`);
    } catch (err) {
      console.error('Failed to create conversation', err);
      setPending(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      {pending ? 'Creating…' : '+ New conversation'}
    </Button>
  );
}
