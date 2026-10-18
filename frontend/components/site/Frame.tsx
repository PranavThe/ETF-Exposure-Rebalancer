// Primitives for the site's "frame": a bordered column with 1px dividers and small +
// crosshair marks wherever two lines meet.

/** A small "+" mark. Position it with className (it is absolutely positioned). */
export function Crosshair({ className = "", size = 9 }: { className?: string; size?: number }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute z-10 block ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current" />
    </span>
  );
}

/**
 * A full-width horizontal rule inside the frame, with crosshairs where it meets the frame's
 * vertical edges and at its centre.
 */
export function FrameDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative h-px bg-line text-faint ${className}`}>
      <Crosshair className="-left-[5px] -top-1" />
      <Crosshair className="left-1/2 -top-1 -translate-x-1/2" />
      <Crosshair className="-right-[5px] -top-1" />
    </div>
  );
}

/** The bordered column every site page sits in. */
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[calc(100%-24px)] max-w-[1440px] border-x border-line sm:w-[calc(100%-48px)] lg:w-[calc(100%-96px)]">
      {children}
    </div>
  );
}

/** Small uppercase mono tag, e.g. "HOW IT WORKS". */
export function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-panel-3 px-2.5 py-1.5 font-mono text-[11px] leading-none tracking-[0.08em] text-fg/85 uppercase">
      {children}
    </span>
  );
}

/** Thin plus icon used by the accordions (rotates to an x when open). */
export function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" className={`site-plus shrink-0 ${className}`}>
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  );
}

/** Thin diagonal arrow for external links. */
export function ArrowUpRight({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" width="10" height="10" className={`shrink-0 ${className}`}>
      <path d="M3.5 8.5l5-5M4.5 3.5h4v4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
