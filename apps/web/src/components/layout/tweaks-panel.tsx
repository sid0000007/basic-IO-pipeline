'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '@/components/layout/icon';

type Theme = 'light' | 'dark';
type Accent = 'olive' | 'forest' | 'terracotta' | 'ink';
type Density = 'compact' | 'comfortable' | 'spacious';
type FontPair = 'serif-sans' | 'all-sans';

interface Tweaks {
  theme: Theme;
  accent: Accent;
  density: Density;
  fontPair: FontPair;
}

const STORAGE_KEY = 'olives.tweaks';
const CHANGE_EVENT = 'olives:tweaks-changed';

const DEFAULTS: Tweaks = {
  theme: 'light',
  accent: 'olive',
  density: 'comfortable',
  fontPair: 'serif-sans',
};

function isTheme(v: string): v is Theme {
  return v === 'light' || v === 'dark';
}
function isAccent(v: string): v is Accent {
  return v === 'olive' || v === 'forest' || v === 'terracotta' || v === 'ink';
}
function isDensity(v: string): v is Density {
  return v === 'compact' || v === 'comfortable' || v === 'spacious';
}
function isFontPair(v: string): v is FontPair {
  return v === 'serif-sans' || v === 'all-sans';
}

function pickString(obj: object, key: string): string | null {
  if (!(key in obj)) return null;
  const record: Record<string, unknown> = { ...obj };
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function parseTweaks(raw: string | null): Tweaks {
  if (raw === null) return DEFAULTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULTS;
    const theme = pickString(parsed, 'theme');
    const accent = pickString(parsed, 'accent');
    const density = pickString(parsed, 'density');
    const fontPair = pickString(parsed, 'fontPair');
    return {
      theme: theme !== null && isTheme(theme) ? theme : DEFAULTS.theme,
      accent: accent !== null && isAccent(accent) ? accent : DEFAULTS.accent,
      density: density !== null && isDensity(density) ? density : DEFAULTS.density,
      fontPair: fontPair !== null && isFontPair(fontPair) ? fontPair : DEFAULTS.fontPair,
    };
  } catch {
    return DEFAULTS;
  }
}

// useSyncExternalStore requires getSnapshot to return a stable reference
// between calls when the underlying value hasn't changed.
let cachedRaw: string | null | undefined = undefined;
let cachedTweaks: Tweaks = DEFAULTS;

function getClientSnapshot(): Tweaks {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedTweaks;
  cachedRaw = raw;
  cachedTweaks = parseTweaks(raw);
  return cachedTweaks;
}

function getServerSnapshot(): Tweaks {
  return DEFAULTS;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function writeTweaks(next: Tweaks): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const tweaks = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', tweaks.theme);
    root.setAttribute('data-accent', tweaks.accent);
    root.setAttribute('data-density', tweaks.density);
    root.setAttribute('data-fontpair', tweaks.fontPair);
  }, [tweaks.theme, tweaks.accent, tweaks.density, tweaks.fontPair]);

  function update<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
    const current = parseTweaks(window.localStorage.getItem(STORAGE_KEY));
    writeTweaks({ ...current, [key]: value });
  }

  return (
    <>
      {open && (
        <div className="tweaks-panel" role="dialog" aria-label="Tweaks">
          <div className="tweaks-head">
            <h4>Tweaks</h4>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close tweaks panel">
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="tweaks-body">
            <Section label="Theme">
              <Radio
                label="Mode"
                value={tweaks.theme}
                onChange={(v) => update('theme', v)}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
              <Radio
                label="Accent"
                value={tweaks.accent}
                onChange={(v) => update('accent', v)}
                options={[
                  { value: 'olive', label: 'Olive' },
                  { value: 'forest', label: 'Forest' },
                  { value: 'terracotta', label: 'Terracotta' },
                  { value: 'ink', label: 'Ink' },
                ]}
              />
            </Section>
            <Section label="Layout">
              <Radio
                label="Density"
                value={tweaks.density}
                onChange={(v) => update('density', v)}
                options={[
                  { value: 'compact', label: 'Compact' },
                  { value: 'comfortable', label: 'Default' },
                  { value: 'spacious', label: 'Roomy' },
                ]}
              />
              <Radio
                label="Type"
                value={tweaks.fontPair}
                onChange={(v) => update('fontPair', v)}
                options={[
                  { value: 'serif-sans', label: 'Serif + Sans' },
                  { value: 'all-sans', label: 'All Sans' },
                ]}
              />
            </Section>
          </div>
        </div>
      )}
      <button
        type="button"
        className="tweaks-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open tweaks panel"
        aria-expanded={open}
      >
        <Icon name="cog" size={18} />
      </button>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tweak-section">
      <span className="tweak-section-label">{label}</span>
      {children}
    </div>
  );
}

interface RadioProps<T extends string> {
  label: string;
  value: T;
  onChange(value: T): void;
  options: ReadonlyArray<{ value: T; label: string }>;
}

function Radio<T extends string>({ label, value, onChange, options }: RadioProps<T>) {
  return (
    <div className="tweak-row">
      <span>{label}</span>
      <div className="tweak-options">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
