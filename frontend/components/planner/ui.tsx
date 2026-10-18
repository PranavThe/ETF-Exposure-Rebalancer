"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** A number that glides to each new value (ease-out cubic). */
export function useTween(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (prefersReducedMotion()) {
      current.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const v = from + (value - from) * (1 - Math.pow(1 - k, 3));
      current.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function AnimatedNumber({ value, format, className = "" }: { value: number; format: (v: number) => string; className?: string }) {
  const v = useTween(value);
  return <span className={`tabular-nums ${className}`}>{format(v)}</span>;
}

const MONO_COLORS = ["#7a73f0", "#2aaa9a", "#c98500", "#d36a85", "#699ee0", "#a0a64c", "#ac77d4", "#d17f59"];

/** A small square badge standing in for an issuer logo. */
export function Monogram({ ticker, size = 28 }: { ticker: string; size?: number }) {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = MONO_COLORS[h % MONO_COLORS.length];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-md font-mono font-semibold tracking-tight"
      style={{
        width: size,
        height: size,
        fontSize: ticker.length > 3 ? size * 0.3 : size * 0.36,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {ticker.slice(0, 4)}
    </span>
  );
}

export type Tab = { id: string; label: React.ReactNode; badge?: React.ReactNode };

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const btn = "flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-panel-3 hover:text-fg disabled:opacity-30";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer: ${label}`}>
        −
      </button>
      <span key={value} className="w-5 animate-pop text-center font-mono text-[15px] tabular-nums text-fg">
        {value}
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More: ${label}`}>
        +
      </button>
    </div>
  );
}

export type Toast = { id: number; text: string; tone?: "ok" | "info" | "error" };

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-12 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex animate-toast items-center gap-2.5 rounded-lg border border-line-2 bg-panel-2/95 px-3.5 py-2.5 text-sm text-fg shadow-2xl backdrop-blur"
        >
          <span
            className={`h-2 w-2 rounded-full ${t.tone === "error" ? "bg-down" : t.tone === "info" ? "bg-accent" : "bg-up"}`}
          />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Underlined text tabs for section headers (no boxes). */
export function TextTabs({ tabs, active, onTab, label }: { tabs: Tab[]; active: string; onTab: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex items-center gap-5 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-1.5 text-[14px] transition-colors ${on ? "text-fg" : "text-faint hover:text-muted"}`}
          >
            {t.label}
            {t.badge !== undefined && <span className={`font-mono text-[12px] ${on ? "text-up" : "text-faint"}`}>{t.badge}</span>}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** A section title row: title on the left, controls on the right. */
export function SectionHeader({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-6 pt-5 pb-3">
      <div className="min-w-0 flex-1 basis-[14rem]">
        <h2 className="text-[15px] font-medium text-fg">{title}</h2>
        {sub && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{sub}</p>}
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center justify-end gap-3">{right}</div>}
    </div>
  );
}

/** Scythe's mark: a crescent blade on a handle with a grip. */
export function ScytheMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="scythe" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7a73f0" />
          <stop offset="1" stopColor="#d6d3ff" />
        </linearGradient>
      </defs>
      <path d="M17.2 3.6 L12.6 21.5" stroke="url(#scythe)" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M13.9 13.2 L17.6 14.1" stroke="url(#scythe)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18.5 3.2 C 12 -0.5, 3.5 2, 1.2 11 C 4.6 6.6, 10.8 5.2, 17.6 6.2 Z" fill="url(#scythe)" />
    </svg>
  );
}
