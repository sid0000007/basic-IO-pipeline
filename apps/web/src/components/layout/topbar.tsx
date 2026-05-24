'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Icon } from '@/components/layout/icon';

interface NavItem {
  href: string;
  label: string;
  match(pathname: string): boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Overview',
    match: (p) => p === '/',
  },
  {
    href: '/conversations',
    label: 'Console',
    match: (p) => p.startsWith('/conversations'),
  },
  {
    href: '/dashboard',
    label: 'Telemetry',
    match: (p) => p === '/dashboard',
  },
  {
    href: '/dashboard/requests',
    label: 'Inference Log',
    match: (p) => p.startsWith('/dashboard/requests'),
  },
  {
    href: '/settings',
    label: 'Settings',
    match: (p) => p.startsWith('/settings'),
  },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const idx = NAV_ITEMS.findIndex((item) => item.match(pathname));
        const next = NAV_ITEMS[(idx + 1) % NAV_ITEMS.length];
        if (next !== undefined) router.push(next.href);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname, router]);

  return (
    <header className="topbar">
      <div className="row">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>Olives</span>
        </Link>
        <span className="brand-meta">v0.4 · sandbox</span>
      </div>

      <nav className="nav" aria-label="primary">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="nav-item"
            aria-current={item.match(pathname) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="topbar-right">
        <button type="button" className="btn btn-quiet btn-sm">
          <Icon name="search" size={14} />
          Search
          <span className="kbd">⌘K</span>
        </button>
        <div className="avatar" title="Siddhartth">
          S
        </div>
      </div>
    </header>
  );
}
