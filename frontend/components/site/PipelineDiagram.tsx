import { BRAND } from "@/lib/brand";

// Sources sit at the bottom; their pipes rise through the ingest stages into the API box.
// Reference data (sector mapping, fund list) joins at the API: sectors are applied at
// analysis time, so it does not pass through the per-file stages.

const SOURCES = [
  { x: 72, label: "ARK INVEST CSV", note: "daily · weights in %", color: "#a6a1ff" },
  { x: 220, label: "SAMPLE FIXTURES", note: "DEMO · SPLT · FLOW", color: "#34c79f" },
  { x: 368, label: "REFERENCE DATA", note: "sectors · funds", color: "#5aa9e6" },
];

// Bottom to top: the order a file moves through.
const STAGES = [
  { y: 322, label: "ADAPTER" },
  { y: 270, label: "VALIDATE" },
  { y: 218, label: "NORMALIZE" },
  { y: 166, label: "LOAD" },
];

const PIPES = [
  { d: "M72 440 V400 Q72 376 96 376 H220", color: SOURCES[0].color },
  { d: "M220 440 V376", color: SOURCES[1].color },
  { d: "M220 376 V122", color: "#c9c6ff" },
  { d: "M368 440 V125 Q368 101 344 101 H312", color: SOURCES[2].color },
];

function Corners({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const s = 3;
  const pts = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];
  return (
    <g stroke="#66666f" strokeWidth="0.8">
      {pts.map(([cx, cy]) => (
        <path key={`${cx}-${cy}`} d={`M${cx - s} ${cy}H${cx + s}M${cx} ${cy - s}V${cy + s}`} />
      ))}
    </g>
  );
}

export default function PipelineDiagram() {
  // A solid plate behind the API label so the dotted fill does not run through the text.
  const labelW = Math.min(184, (BRAND.length + 4) * 8 + 14);
  return (
    <figure className="mx-auto w-full max-w-[500px]">
      <svg
        viewBox="0 0 440 510"
        role="img"
        aria-labelledby="site-pipe-title site-pipe-desc"
        className="block h-auto w-full overflow-visible"
      >
        <title id="site-pipe-title">{`${BRAND} ingest pipeline`}</title>
        <desc id="site-pipe-desc">
          ARK Invest CSV files and sample fixtures pass through four stages, adapter, validate, normalize and load, into
          the {BRAND} API. Reference data for sectors and funds joins at the API.
        </desc>
        <defs>
          {SOURCES.map((s, i) => (
            <linearGradient key={s.label} id={`site-pipe-tint-${i}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="0.6" stopColor={s.color} stopOpacity="0.06" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <pattern id="site-pipe-dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="#ececf1" fillOpacity="0.16" />
          </pattern>
          <filter id="site-pipe-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Output pipe above the API box, with two glowing "responses". */}
        <path d="M220 6 V78" stroke="#18181c" strokeWidth="16" fill="none" />
        <path d="M220 6 V78" stroke="#ececf1" strokeOpacity="0.5" strokeWidth="1.4" fill="none" className="flow-dash" />
        {[22, 50].map((cy, i) => (
          <g key={cy} className="site-pulse" style={{ animationDelay: `${i * 0.6}s` }}>
            <circle cx="220" cy={cy} r="5" fill="#ffffff" filter="url(#site-pipe-glow)" opacity="0.8" />
            <circle cx="220" cy={cy} r="3.6" fill="#ffffff" />
          </g>
        ))}
        <text x="240" y="30" className="font-mono" fontSize="9.5" letterSpacing="0.08em" fill="#66666f">
          PUBLIC REST · JSON
        </text>
        <text x="240" y="46" className="font-mono" fontSize="9.5" letterSpacing="0.04em" fill="#66666f">
          /funds/{"{ticker}"}/changes
        </text>

        {/* Pipes: a dark tube, a colour tint near its source, and a moving dashed core. */}
        {PIPES.map((p) => (
          <path key={`tube-${p.d}`} d={p.d} stroke="#18181c" strokeWidth="16" fill="none" strokeLinejoin="round" />
        ))}
        <path d="M72 440 V376" stroke={`url(#site-pipe-tint-0)`} strokeWidth="16" fill="none" />
        <path d="M220 440 V330" stroke={`url(#site-pipe-tint-1)`} strokeWidth="16" fill="none" />
        <path d="M368 440 V250" stroke={`url(#site-pipe-tint-2)`} strokeWidth="16" fill="none" />
        {PIPES.map((p) => (
          <path
            key={`flow-${p.d}`}
            d={p.d}
            stroke={p.color}
            strokeOpacity="0.85"
            strokeWidth="1.4"
            fill="none"
            className="flow-dash"
          />
        ))}

        {/* Junction nodes. */}
        <circle cx="220" cy="376" r="6" fill="#0b0b0d" stroke="#a6a1ff" strokeWidth="1.2" />
        <circle cx="220" cy="376" r="2" fill="#a6a1ff" />
        <circle cx="322" cy="101" r="6" fill="#0b0b0d" stroke="#5aa9e6" strokeWidth="1.2" />
        <circle cx="322" cy="101" r="2" fill="#5aa9e6" />

        {/* Stages on the trunk. */}
        {STAGES.map((s, i) => (
          <g key={s.label}>
            <rect x="160" y={s.y - 12} width="120" height="24" rx="2" fill="#121215" stroke="#2d2d33" />
            <text x="172" y={s.y + 3.5} className="font-mono" fontSize="9" fill="#66666f">
              {`0${i + 1}`}
            </text>
            <text
              x="226"
              y={s.y + 3.5}
              textAnchor="middle"
              className="font-mono"
              fontSize="10"
              letterSpacing="0.1em"
              fill="#ececf1"
              fillOpacity="0.85"
            >
              {s.label}
            </text>
          </g>
        ))}

        {/* The API box. */}
        <rect x="124" y="80" width="192" height="42" fill="#0e0e11" stroke="#2d2d33" />
        <rect x="124" y="80" width="192" height="42" fill="url(#site-pipe-dots)" />
        <rect x={220 - labelW / 2} y="91" width={labelW} height="20" fill="#0e0e11" />
        <text
          x="220"
          y="105"
          textAnchor="middle"
          className="font-mono"
          fontSize="11"
          fontWeight="600"
          letterSpacing="0.12em"
          fill="#ececf1"
        >
          {`${BRAND.toUpperCase()} API`}
        </text>
        <Corners x={124} y={80} w={192} h={42} />

        {/* Sources. */}
        {SOURCES.map((s) => (
          <g key={s.label}>
            <rect x={s.x - 66} y="440" width="132" height="36" fill="#121215" stroke="#2d2d33" />
            <rect x={s.x - 66} y="440" width="132" height="2" fill={s.color} fillOpacity="0.55" />
            <text
              x={s.x}
              y="463"
              textAnchor="middle"
              className="font-mono"
              fontSize="10"
              letterSpacing="0.08em"
              fill="#ececf1"
              fillOpacity="0.8"
            >
              {s.label}
            </text>
            <text x={s.x} y="494" textAnchor="middle" className="font-mono" fontSize="9" fill="#66666f">
              {s.note}
            </text>
            <Corners x={s.x - 66} y={440} w={132} h={36} />
          </g>
        ))}
      </svg>
    </figure>
  );
}
