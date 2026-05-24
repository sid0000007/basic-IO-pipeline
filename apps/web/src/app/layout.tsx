import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { Topbar } from '@/components/layout/topbar';
import { TweaksPanel } from '@/components/layout/tweaks-panel';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Olives — AI risk coverage',
  description:
    'Risk infrastructure for AI products. Underwriting for hallucinations, prompt injection, IP leakage, and model regressions — priced from your inference telemetry.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-accent="olive"
      data-density="comfortable"
      data-fontpair="serif-sans"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <div className="app">
          <Topbar />
          {children}
        </div>
        <TweaksPanel />
      </body>
    </html>
  );
}
