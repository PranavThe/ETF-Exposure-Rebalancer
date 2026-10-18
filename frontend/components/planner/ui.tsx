"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

/** Kairos terminal panel: a tab strip with a sliding underline over a scrolling body. */
export function Pane({
  tabs,
  active,
  onTab,
  right,
  footer,
  children,
  className = "",
  bodyClassName = "",
}: {
  tabs: Tab[];
  active: string;
  onTab?: (id: string) => void;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    if (!el) return;
    const measure = () => setBar({ left: el.offsetLeft, width: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, tabs.length]);

  return (
    <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-panel/95 transition-colors duration-300 hover:border-line-2/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur ${className}`}>
      <div className="relative flex h-11 shrink-0 items-stretch border-b border-line">
        <div ref={strip} role="tablist" className="relative flex min-w-0 items-stretch overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab={t.id}
              aria-selected={t.id === active}
              onClick={() => onTab?.(t.id)}
              className={`flex shrink-0 items-center gap-2 px-4 text-[14px] transition-colors duration-200 ${
                t.id === active ? "text-fg" : "text-faint hover:text-muted"
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="rounded bg-panel-3 px-1.5 py-px font-mono text-[11px] text-muted">{t.badge}</span>
              )}
            </button>
          ))}
          {bar && (
            <span
              aria-hidden
              className="absolute bottom-0 h-[2px] rounded-full bg-accent transition-all duration-300 ease-out"
              style={{ left: bar.left + 12, width: Math.max(0, bar.width - 24) }}
            />
          )}
        </div>
        {right && <div className="ml-auto flex shrink-0 items-center gap-2 pl-2 pr-3 text-xs text-muted">{right}</div>}
      </div>
      <div role="tabpanel" className={`relative min-h-0 flex-1 overflow-auto ${bodyClassName}`}>
        {children}
      </div>
      {footer && <div className="shrink-0 border-t border-line">{footer}</div>}
    </section>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-canvas p-0.5 ring-1 ring-line">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex-1 whitespace-nowrap rounded-[5px] font-medium transition-all duration-200 ${size === "sm" ? "px-2 py-1 text-xs" : "px-2 py-1.5 text-[13px]"} ${
              on ? "bg-panel-3 text-fg shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : "text-faint hover:text-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-16 z-50 flex flex-col items-end gap-2">
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

/** The product mark: three rising strokes. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7a73f0" />
          <stop offset="1" stopColor="#c9c6ff" />
        </linearGradient>
      </defs>
      <path d="M4 19 L9 13" stroke="url(#bm)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 20 L15 9" stroke="url(#bm)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M13 20 L20 5" stroke="url(#bm)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
