interface Props {
  data: number[];
  meta: string;
}

export function RequestsChart({ data, meta }: Props) {
  const safeData = data.length > 0 ? data : [4, 5, 6, 7, 6, 8, 9, 7, 6, 8, 10, 9];
  const max = Math.max(...safeData, 1);
  const W = 100;
  const H = 100;
  const stepX = safeData.length > 1 ? W / (safeData.length - 1) : W;
  const pts = safeData.map<[number, number]>((v, i) => [i * stepX, H - (v / max) * H]);
  const path = 'M ' + pts.map((p) => `${p[0]} ${p[1]}`).join(' L ');
  const area = path + ` L ${W} ${H} L 0 ${H} Z`;
  const peak = Math.round(Math.max(...safeData));
  const avg = Math.round(safeData.reduce((a, b) => a + b, 0) / safeData.length);

  return (
    <>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="reqGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={p}
              x1="0"
              x2={W}
              y1={H * p}
              y2={H * p}
              stroke="var(--border-soft)"
              strokeWidth="0.2"
            />
          ))}
          <path d={area} fill="url(#reqGradient)" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="0.6" strokeLinejoin="round" />
          {pts
            .filter((_, i) => i % Math.max(1, Math.round(safeData.length / 8)) === 0)
            .map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="0.6" fill="var(--accent)" />
            ))}
        </svg>
      </div>
      <div className="chart-x">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>now</span>
      </div>
      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--accent)' }} />
          Total requests
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--muted-2)' }} />
          Baseline (7d avg)
        </span>
        <span style={{ marginLeft: 'auto' }}>
          Peak {peak} · Avg {avg} · {meta}
        </span>
      </div>
    </>
  );
}
