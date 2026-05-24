'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  disabled: boolean;
  onSubmit(content: string): void;
}

export function Composer({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState('');

  function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
    setValue('');
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Send a message…"
        rows={3}
        disabled={disabled}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">⌘/Ctrl + Enter to send</p>
        <Button type="submit" disabled={disabled || value.trim().length === 0}>
          Send
        </Button>
      </div>
    </form>
  );
}
