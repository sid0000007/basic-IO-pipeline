import Link from 'next/link';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="shrink-0 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/conversations" className="text-lg font-semibold">
            Olives
          </Link>
          <span className="text-muted-foreground text-xs">Phase 1 chat</span>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-6 py-6">
        {children}
      </div>
    </div>
  );
}
