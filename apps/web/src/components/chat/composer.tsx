'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/components/layout/icon';

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
    <form onSubmit={handleSubmit} className="composer">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tell Olive about your deployment…"
        rows={2}
        disabled={disabled}
        onKeyDown={handleKeyDown}
      />
      <div className="composer-foot">
        <div className="composer-tools">
          <button type="button" title="Attach">
            <Icon name="attach" size={14} />
          </button>
          <button type="button" title="Image">
            <Icon name="image" size={14} />
          </button>
          <button type="button" title="Tools">
            <Icon name="wand" size={14} />
          </button>
        </div>
        <button
          type="submit"
          className="composer-send"
          disabled={disabled || value.trim().length === 0}
        >
          Send <Icon name="send" size={12} />
        </button>
      </div>
    </form>
  );
}
