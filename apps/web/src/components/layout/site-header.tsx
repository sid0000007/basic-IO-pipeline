'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  {
    href: '/conversations',
    label: 'Chat',
    isActive: (p: string) => p === '/' || p.startsWith('/conversations'),
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    isActive: (p: string) => p === '/dashboard',
  },
  {
    href: '/dashboard/requests',
    label: 'Requests',
    isActive: (p: string) => p.startsWith('/dashboard/requests'),
  },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="shrink-0 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/conversations" className="text-lg font-semibold">
          Olives
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'hover:text-foreground transition-colors',
                l.isActive(pathname)
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
