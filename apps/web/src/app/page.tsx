import Link from 'next/link';
import { Icon } from '@/components/layout/icon';

interface Peril {
  num: string;
  title: string;
  body: string;
  tag: string;
}

const PERILS: Peril[] = [
  {
    num: '01',
    title: 'Hallucination liability',
    body: 'Defense and indemnity when a generated response is materially wrong and a customer suffers loss.',
    tag: 'Peril A · per-claim',
  },
  {
    num: '02',
    title: 'Prompt-injection breach',
    body: 'Data exfiltration via indirect prompt injection through a tool, RAG corpus, or untrusted input.',
    tag: 'Peril B · aggregate',
  },
  {
    num: '03',
    title: 'Training-set exposure',
    body: 'IP, copyright, and trade-secret claims tied to outputs that reproduce protected material.',
    tag: 'Peril C · per-claim',
  },
  {
    num: '04',
    title: 'Model-regression downtime',
    body: 'Business-interruption coverage when a provider silently degrades or deprecates a pinned model.',
    tag: 'Peril D · daily limit',
  },
  {
    num: '05',
    title: 'Autonomous agent acts',
    body: 'Third-party loss caused by an agent taking real-world actions (writes, payments, sends) under your auth.',
    tag: 'Peril E · per-act',
  },
  {
    num: '06',
    title: 'Bias & disparate impact',
    body: 'Regulatory defense and settlement coverage for adverse outcomes flagged by a covered fairness audit.',
    tag: 'Peril F · aggregate',
  },
];

interface Step {
  num: string;
  title: string;
  body: string;
  tag: string;
}

const STEPS: Step[] = [
  {
    num: 'i.',
    title: 'Connect your stack',
    body: 'Drop in an API key, or proxy your traffic through us. We classify every call by risk surface.',
    tag: '≈ 2 minutes',
  },
  {
    num: 'ii.',
    title: 'Talk to Olive',
    body: 'Our underwriter walks you through deployment, controls, and customer profile in plain language.',
    tag: '≈ 15 minutes',
  },
  {
    num: 'iii.',
    title: 'Bind, then monitor',
    body: 'Bind in-app. We keep watching your telemetry and raise an alert before a claim ever becomes one.',
    tag: 'continuous',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="hero">
        <div>
          <div className="eyebrow">Coverage for AI failures</div>
          <h1>
            Underwriting for products that&nbsp;<em>think.</em>
          </h1>
        </div>
        <div>
          <p>
            Olives is risk infrastructure for companies shipping AI. We cover the failures your
            cyber and E&amp;O policies don&apos;t — hallucinations, prompt injection, IP leakage,
            model regressions — and we price it from your own inference telemetry.
          </p>
          <div className="hero-cta">
            <Link href="/conversations" className="btn btn-primary btn-lg">
              Start a coverage review <Icon name="arrow" size={14} />
            </Link>
            <Link href="/dashboard" className="btn btn-ghost btn-lg">
              See your telemetry
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>What we cover that your cyber policy doesn&apos;t.</h2>
          <p>Six named perils. Underwritten per-deployment.</p>
        </div>
        <div className="coverage-grid">
          {PERILS.map((p) => (
            <div key={p.num} className="coverage-cell">
              <div className="num">{p.num}</div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <div className="tag">{p.tag}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Backed by carriers who actually read your logs.</h2>
          <p>Underwriting is continuous. Premium adjusts to the risk you actually run.</p>
        </div>
        <div className="logos">
          <div className="logos-label">Trusted by</div>
          <div className="logo-blot">Helix Health</div>
          <div className="logo-blot sans">PARALLEL/</div>
          <div className="logo-blot mono">$ northstar</div>
          <div className="logo-blot">Birchwood Legal</div>
          <div className="logo-blot sans">Foundry.ai</div>
          <div className="logo-blot mono">∂rift</div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>How it works.</h2>
          <p>Three steps to a quote. Most teams finish in under twenty minutes.</p>
        </div>
        <div className="coverage-grid">
          {STEPS.map((s) => (
            <div key={s.num} className="coverage-cell">
              <div className="num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <div className="tag">{s.tag}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="foot-note">
        Not licensed insurance advice in every state. Coverage availability varies by jurisdiction.{' '}
        <a href="#">Read the fine print</a>.
      </p>
    </div>
  );
}
