import { Icon } from '@/components/layout/icon';

const SUGGESTIONS = [
  {
    tag: 'QUOTE',
    title: 'Quote my deployment',
    sub: "Walk through controls, get a binder by end of call.",
  },
  {
    tag: 'INCIDENT',
    title: 'Report an incident',
    sub: 'Open a claim or a near-miss for one of your covered perils.',
  },
  {
    tag: 'POLICY',
    title: 'Explain my coverage',
    sub: "Plain-language summary of what's covered and what isn't.",
  },
  {
    tag: 'BENCHMARK',
    title: 'Benchmark my risk',
    sub: 'Compare your telemetry to similar deployments in our book.',
  },
];

export default function ConversationsIndexPage() {
  return (
    <>
      <div className="chat-head">
        <div>
          <h1>Coverage review — new session</h1>
          <div className="sub">
            <span className="pill">
              <span className="live-dot" /> Ready
            </span>
            <span>Olive · claude-sonnet-4-6</span>
            <span>·</span>
            <span>Pick a starter or open a previous review</span>
          </div>
        </div>
        <div className="chat-actions">
          <button type="button" className="btn btn-ghost btn-sm">
            <Icon name="download" size={13} /> Export
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="more">
            <Icon name="more" size={14} />
          </button>
        </div>
      </div>

      <div className="thread">
        <div
          style={{
            textAlign: 'center',
            maxWidth: 520,
            margin: '60px auto 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 32,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
            }}
          >
            Hi — Olive here.
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            I underwrite AI risk. Start a new review from the left, or pick a starter below — I&apos;ll
            walk you through your deployment, scope the perils that fit, and put an indicative
            binder in front of you in about fifteen minutes.
          </p>
        </div>
      </div>

      <div className="composer-wrap">
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s.tag} type="button" className="suggestion" disabled>
              <span className="tag">{s.tag}</span>
              <strong>{s.title}</strong>
              <span>{s.sub}</span>
            </button>
          ))}
        </div>
        <div className="composer">
          <textarea
            placeholder="Click ‘New review’ in the rail to start typing…"
            rows={2}
            disabled
          />
          <div className="composer-foot">
            <div className="composer-tools">
              <button type="button" disabled title="Attach">
                <Icon name="attach" size={14} />
              </button>
              <button type="button" disabled title="Image">
                <Icon name="image" size={14} />
              </button>
              <button type="button" disabled title="Tools">
                <Icon name="wand" size={14} />
              </button>
            </div>
            <button type="button" className="composer-send" disabled>
              Send <Icon name="send" size={12} />
            </button>
          </div>
        </div>
        <div className="composer-hint">
          <span className="kbd">⌘</span>
          <span className="kbd">↵</span>
          <span>to send</span>
          <span style={{ marginLeft: 'auto' }}>
            Open a review from the rail to start a session.
          </span>
        </div>
      </div>
    </>
  );
}
