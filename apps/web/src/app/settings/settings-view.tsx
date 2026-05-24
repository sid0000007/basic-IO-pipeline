'use client';

import { useState } from 'react';
import { Icon } from '@/components/layout/icon';

type SectionKey =
  | 'general'
  | 'team'
  | 'billing'
  | 'providers'
  | 'ingestion'
  | 'policy'
  | 'coverage'
  | 'claims';

interface ProviderConfig {
  id: string;
  name: string;
  key: string;
  default: string;
}

const PROVIDERS: ReadonlyArray<ProviderConfig> = [
  { id: 'anthropic', name: 'Anthropic', key: 'sk-ant-...A7K9', default: 'claude-sonnet-4-6' },
  { id: 'openai', name: 'OpenAI', key: 'sk-proj-...3xT2', default: 'gpt-5-mini' },
  { id: 'google', name: 'Google AI', key: 'AIza...uV81', default: 'gemini-2.5-pro' },
  { id: 'deepseek', name: 'DeepSeek', key: '(not connected)', default: '—' },
  { id: 'azure', name: 'Azure OpenAI', key: '(not connected)', default: '—' },
];

const INITIAL_ENABLED: Record<string, boolean> = {
  anthropic: true,
  openai: true,
  google: true,
  deepseek: false,
  azure: false,
};

interface NavItem {
  group: string;
  key: SectionKey;
  label: string;
}

const NAV: ReadonlyArray<NavItem> = [
  { group: 'Workspace', key: 'general', label: 'General' },
  { group: 'Workspace', key: 'team', label: 'Team & access' },
  { group: 'Workspace', key: 'billing', label: 'Billing' },
  { group: 'AI', key: 'providers', label: 'Providers & models' },
  { group: 'AI', key: 'ingestion', label: 'Ingestion sources' },
  { group: 'AI', key: 'policy', label: 'Policy & guardrails' },
  { group: 'Insurance', key: 'coverage', label: 'Active coverage' },
  { group: 'Insurance', key: 'claims', label: 'Claims history' },
];

export function SettingsView() {
  const [section, setSection] = useState<SectionKey>('providers');
  const [enabled, setEnabled] = useState<Record<string, boolean>>(INITIAL_ENABLED);
  const [hil, setHil] = useState(true);
  const [piiOn, setPiiOn] = useState(true);
  const [failClosed, setFailClosed] = useState(false);

  const groups = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    const list = acc[item.group] ?? [];
    list.push(item);
    acc[item.group] = list;
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>
            Configure the model providers, ingestion sources, and underwriting controls Olives uses
            for your account.
          </p>
        </div>
      </div>

      <div className="settings">
        <nav className="settings-nav">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="group-label">{group}</div>
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-current={section === item.key}
                  onClick={() => setSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="settings-body">
          <div className="setting-card">
            <div className="setting-card-head">
              <div>
                <h3>Model providers</h3>
                <p>Olives proxies every call. Add a key once, route by policy.</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm">
                <Icon name="plus" size={12} /> Add provider
              </button>
            </div>
            <div className="provider-card-list">
              {PROVIDERS.map((p) => {
                const isOn = enabled[p.id] === true;
                return (
                  <div className="provider-card-row" key={p.id}>
                    <div className="logo">{p.name.charAt(0)}</div>
                    <div>
                      <div className="name">{p.name}</div>
                      <div className="key">
                        <Icon name="key" size={10} /> {p.key}{' '}
                        <span style={{ color: 'var(--muted-2)' }}>· default: {p.default}</span>
                      </div>
                    </div>
                    <div className={'provider-status' + (isOn ? ' on' : '')}>
                      <span
                        className="live-dot"
                        style={{
                          background: isOn ? 'var(--ok)' : 'var(--muted-2)',
                          boxShadow: 'none',
                        }}
                      />
                      {isOn ? 'Active' : 'Off'}
                    </div>
                    <button
                      type="button"
                      className={'switch' + (isOn ? ' on' : '')}
                      aria-label={`Toggle ${p.name}`}
                      onClick={() => setEnabled((e) => ({ ...e, [p.id]: e[p.id] !== true }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-head">
              <div>
                <h3>Underwriting controls</h3>
                <p>These adjust how aggressively Olive negotiates your premium with carriers.</p>
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <div className="name">Log retention</div>
                <div className="desc">
                  How long full request payloads are retained for underwriting and audit.
                </div>
              </div>
              <div className="field-control">
                <select defaultValue="90">
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">365 days</option>
                </select>
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <div className="name">PII redaction</div>
                <div className="desc">Mask emails, phones, SSNs before logs leave your VPC.</div>
              </div>
              <div className="field-control">
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: piiOn ? 'var(--ok)' : 'var(--muted)',
                    }}
                  >
                    {piiOn ? 'ON · strict' : 'off'}
                  </span>
                  <button
                    type="button"
                    className={'switch' + (piiOn ? ' on' : '')}
                    aria-label="Toggle PII redaction"
                    onClick={() => setPiiOn((v) => !v)}
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <div className="name">Human-in-the-loop</div>
                <div className="desc">
                  Require approval before any agent performs a Peril E action (write, payment,
                  send).
                </div>
              </div>
              <div className="field-control">
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: hil ? 'var(--ok)' : 'var(--muted)',
                    }}
                  >
                    {hil ? 'required' : 'off'}
                  </span>
                  <button
                    type="button"
                    className={'switch' + (hil ? ' on' : '')}
                    aria-label="Toggle human-in-the-loop"
                    onClick={() => setHil((v) => !v)}
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <div className="name">Fail-closed mode</div>
                <div className="desc">
                  If a provider goes down, halt rather than fall back to an uncovered model.
                </div>
              </div>
              <div className="field-control">
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: failClosed ? 'var(--ok)' : 'var(--muted)',
                    }}
                  >
                    {failClosed ? 'on' : 'off'}
                  </span>
                  <button
                    type="button"
                    className={'switch' + (failClosed ? ' on' : '')}
                    aria-label="Toggle fail-closed"
                    onClick={() => setFailClosed((v) => !v)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-head">
              <div>
                <h3>Active coverage</h3>
                <p>Olives Pro · bound May 1, 2026 · renews monthly.</p>
              </div>
              <span className="status-pill ok">
                <span className="live-dot" /> In force
              </span>
            </div>
            <div className="coverage-card-body" style={{ padding: 20 }}>
              <div className="coverage-row">
                <span>Aggregate limit</span>
                <span className="v">$5,000,000</span>
              </div>
              <div className="coverage-row">
                <span>Perils in scope</span>
                <span className="v">A · B · E</span>
              </div>
              <div className="coverage-row">
                <span>Retention</span>
                <span className="v">$10,000 per claim</span>
              </div>
              <div className="coverage-row">
                <span>Carrier</span>
                <span className="v">Northstar Speciality</span>
              </div>
              <div className="coverage-row">
                <span>Premium · this month</span>
                <span className="v">$4,820</span>
              </div>
            </div>
          </div>

          <p className="foot-note">
            Showing the <strong style={{ color: 'var(--text)' }}>{section}</strong> section.
          </p>
        </div>
      </div>
    </div>
  );
}
