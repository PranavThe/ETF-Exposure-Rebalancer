// Small building blocks shared by the fund profile and movers pages (Kairos-style chrome).

import type { CSSProperties, ReactNode } from "react";

/** Very faint, large diagonal arcs behind a page. Decorative only. */
export function ArcLines() {
  const rings = [520, 700, 880, 1060, 1240, 1420, 1600];
  return (
    // The outer box matches the page, so the arcs never add scroll height or width.
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="h-[1100px] w-full [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
        viewBox="0 0 1600 1100"
        preserveAspectRatio="xMidYMin slice"
        fill="none"
      >
        {rings.map((r, i) => (
          <circle key={r} cx={-120} cy={1380} r={r} stroke="#ffffff" strokeOpacity={i % 2 ? 0.028 : 0.045} />
        ))}
        {[460, 760].map((r) => (
          <circle key={r} cx={1780} cy={-260} r={r} stroke="#a6a1ff" strokeOpacity={0.06} />
        ))}
      </svg>
    </div>
  );
}

/** A dark panel with a 1px border. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`relative flex min-w-0 flex-col overflow-hidden rounded-md border border-line bg-panel ${className}`}>
      {children}
    </section>
  );
}

/** Panel header: a tiny uppercase title (or tabs) on the left, anything on the right. */
export function CardHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-stretch justify-between gap-3 border-b border-line px-4">
      <div className="flex min-w-0 items-center">{children}</div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export type TabOption<T extends string> = { id: T; label: string; count?: number };

/** Underline tabs. `caps` is the tiny mono variant used in panel headers. */
export function UnderlineTabs<T extends string>({
  tabs,
  active,
  onChange,
  caps = false,
  label,
}: {
  tabs: TabOption<T>[];
  active: T;
  onChange: (id: T) => void;
  caps?: boolean;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex items-stretch ${caps ? "gap-4" : "gap-6"}`}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b whitespace-nowrap transition-colors ${
              caps ? "font-mono text-[11px] tracking-[0.06em] uppercase" : "py-2.5 text-sm"
            } ${on ? "border-accent text-accent" : "border-transparent text-faint hover:text-muted"}`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`font-mono text-[11px] ${on ? "text-accent/70" : "text-faint"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; disabled?: boolean; title?: string };

/** A segmented control; the active segment is filled in dark lavender. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-md border border-line bg-panel p-0.5 ${className}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`h-7 shrink-0 rounded px-3 text-[13px] whitespace-nowrap transition-colors ${
              on ? "bg-accent-strong/30 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg"
            } disabled:cursor-not-allowed disabled:bg-transparent disabled:text-faint/60`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A halftone dot pattern fading out from one corner (Kairos-style decoration). */
export function Halftone({ className = "" }: { className?: string }) {
  // Big dots near the corner, smaller ones further out; each ring fades out well inside the box.
  const layers = [
    { dot: 2.1, solid: 30, fade: 95, alpha: 0.55 },
    { dot: 1.4, solid: 70, fade: 150, alpha: 0.4 },
    { dot: 0.8, solid: 110, fade: 205, alpha: 0.3 },
  ];
  return (
    <div aria-hidden className={`pointer-events-none absolute h-[220px] w-[240px] ${className}`}>
      {layers.map((l, i) => {
        const inner = i === 0 ? 0 : layers[i - 1].solid;
        const mask = `radial-gradient(circle at 0% 100%, transparent ${Math.max(0, inner - 25)}px, #000 ${inner}px, #000 ${l.solid}px, transparent ${l.fade}px)`;
        const style: CSSProperties = {
          backgroundImage: `radial-gradient(circle, rgba(166,161,255,${l.alpha}) ${l.dot}px, transparent ${l.dot + 0.5}px)`,
          backgroundSize: "7px 7px",
          backgroundPosition: "0 100%",
          maskImage: mask,
          WebkitMaskImage: mask,
        };
        return <div key={i} className="absolute inset-0" style={style} />;
      })}
    </div>
  );
}

// Gradient pairs for avatars, picked deterministically from a fund ticker.
const PALETTE: [string, string][] = [
  ["#ffb08a", "#b8502c"],
  ["#5ee0bd", "#1a7f64"],
  ["#f2c46b", "#a8661a"],
  ["#7cc4ff", "#2a62c0"],
  ["#d39bff", "#7438c4"],
  ["#c6e86a", "#5a8a1d"],
  ["#b9b5ff", "#5149cf"],
  ["#7ae7f0", "#1a7f8f"],
  ["#ff8fab", "#b8355a"],
  ["#f0a6d8", "#963b7e"],
];

function fnv(s: string): number {
  let x = 2166136261;
  for (const c of s) {
    x ^= c.charCodeAt(0);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return x;
}

export function fundColors(fund: string): [string, string] {
  return PALETTE[fnv(fund) % PALETTE.length];
}

/** A round gradient avatar with initials, coloured by `seed`, with an optional small badge. */
export function Avatar({
  seed,
  text,
  size = 36,
  badge,
}: {
  seed: string;
  text: string;
  size?: number;
  badge?: string;
}) {
  const [a, b] = fundColors(seed);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-mono font-semibold text-black/75"
        style={{
          background: `radial-gradient(circle at 30% 25%, ${a}, ${b} 85%)`,
          fontSize: Math.round(size * 0.32),
        }}
      >
        {text}
      </span>
      {badge && (
        <span
          className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-canvas bg-panel-3 px-1 font-mono text-[9px] leading-none font-semibold"
          style={{ color: a }}
          title={badge}
        >
          {badge.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

export function initials(ticker: string, name: string): string {
  const t = ticker.split(" ")[0];
  if (t) return t.slice(0, 2).toUpperCase();
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

/** "2026-10-01" -> "Oct 1, 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-10" -> "Oct 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** A per-share price: 1251.61 -> "$1,251.61". */
export function usd(x: number | null): string {
  if (x === null) return "—";
  return `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A stored timestamp without its microseconds: "2026-10-17 22:05 UTC". */
export function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** A centred empty state with a faint glyph, a line of copy and an optional action. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <svg aria-hidden width="36" height="36" viewBox="0 0 36 36" fill="none" className="mb-1 text-line-2">
        <rect x="5" y="8" width="26" height="20" rx="3" stroke="currentColor" />
        <path d="M5 14h26M11 20h8M11 23.5h5" stroke="currentColor" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-fg">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
