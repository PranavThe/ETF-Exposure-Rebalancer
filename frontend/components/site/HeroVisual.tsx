// Decorative hero background: a field of diverging bars around a zero axis, lavender for
// price and amber for portfolio activity, each slowly growing and shrinking. Pure SVG + CSS;
// the motion stops under prefers-reduced-motion (site.css).

const W = 1200;
const H = 720;
const AXIS = 760;

// Small deterministic PRNG (mulberry32) so server and client render the same field.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bar = { y: number; h: number; len: number; dir: 1 | -1; kind: "price" | "activity"; from: number; to: number; dur: number; delay: number };

function buildBars(): Bar[] {
  const r = rng(20261016);
  const bars: Bar[] = [];
  for (let y = 36; y < H - 30; y += 15) {
    if (r() < 0.12) continue; // a few empty rows keep it from looking like a grid
    const h = 3 + Math.round(r() * 3);
    // Mostly price to the right and activity to the left, with some rows reversed.
    const flip = r() < 0.28;
    const price = 40 + r() * 330;
    const activity = 30 + r() * 300;
    const common = { h, dur: 9 + r() * 9, delay: -r() * 18 };
    bars.push({ ...common, y, len: price, dir: flip ? -1 : 1, kind: "price", from: 0.35 + r() * 0.3, to: 0.85 + r() * 0.15 });
    bars.push({
      ...common,
      y,
      len: activity,
      dir: flip ? 1 : -1,
      kind: "activity",
      from: 0.9 + r() * 0.1,
      to: 0.3 + r() * 0.35,
    });
  }
  return bars;
}

const BARS = buildBars();

export default function HeroVisual() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="site-dots absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,#000_10%,transparent_75%)]" />
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_62%_68%_at_62%_40%,#000_25%,transparent_78%)]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          {BARS.map((b, i) => {
            const x = b.dir === 1 ? AXIS : AXIS - b.len;
            return (
              <rect
                key={i}
                x={x}
                y={b.y - b.h / 2}
                width={b.len}
                height={b.h}
                rx={1}
                fill={b.kind === "price" ? "#7a73f0" : "#c98500"}
                fillOpacity={b.kind === "price" ? 0.42 : 0.3}
                className="site-drift"
                style={
                  {
                    transformOrigin: `${AXIS}px 0px`,
                    "--from": b.from.toFixed(3),
                    "--to": b.to.toFixed(3),
                    "--dur": `${b.dur.toFixed(2)}s`,
                    "--delay": `${b.delay.toFixed(2)}s`,
                  } as React.CSSProperties
                }
              />
            );
          })}
          <line x1={AXIS} y1={10} x2={AXIS} y2={H - 10} stroke="#ececf1" strokeOpacity="0.28" strokeWidth="1" className="flow-dash" />
          <text x={AXIS + 14} y={28} className="font-mono" fontSize="11" letterSpacing="0.1em" fill="#a6a1ff" fillOpacity="0.55">
            PRICE →
          </text>
          <text
            x={AXIS - 14}
            y={28}
            textAnchor="end"
            className="font-mono"
            fontSize="11"
            letterSpacing="0.1em"
            fill="#c98500"
            fillOpacity="0.6"
          >
            ← PORTFOLIO ACTIVITY
          </text>
        </svg>
      </div>
      <div className="site-scan absolute inset-0" />
      {/* Keep the headline corner dark. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,#050506_8%,transparent_45%)]" />
    </div>
  );
}
