import { SiteHeader } from '@/components/layout/site-header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">{children}</div>
    </div>
  );
}
