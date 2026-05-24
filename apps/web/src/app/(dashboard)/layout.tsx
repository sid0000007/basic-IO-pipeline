import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-lg font-semibold">
            Olives
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/conversations" className="text-muted-foreground hover:text-foreground">
              Chat
            </Link>
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link
              href="/dashboard/requests"
              className="text-muted-foreground hover:text-foreground"
            >
              Requests
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</div>
    </div>
  );
}
