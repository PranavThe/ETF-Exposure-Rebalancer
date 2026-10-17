import { pp } from "@/lib/format";

import { badgeStyle, ppNum } from "./derive";

/** A square fund badge, standing in for a market icon. */
export function FundBadge({ ticker, size = "md" }: { ticker: string; size?: "xs" | "sm" | "md" }) {
  if (size === "xs") return <span aria-hidden style={badgeStyle(ticker)} className="h-2.5 w-2.5 shrink-0 rounded-[3px]" />;
  const box = size === "sm" ? "h-8 w-8 rounded text-[9px]" : "h-10 w-10 rounded-md text-[10px]";
  return (
    <span
      style={badgeStyle(ticker)}
      className={`flex shrink-0 items-center justify-center font-mono font-semibold tracking-tight text-white/90 ${box}`}
    >
      {ticker.slice(0, 4)}
    </span>
  );
}

/** Two tinted info chips for a weight change's price effect and portfolio activity. Not buttons. */
export function SplitChips({ price, activity, wide = false }: { price: number; activity: number; wide?: boolean }) {
  const base = `inline-block rounded px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums ${wide ? "w-[4.25rem]" : "w-[3.9rem]"}`;
  return (
    <>
      <span title={`Price effect ${pp(price)}`} className={`${base} bg-price/15 text-accent`}>
        P {ppNum(price)}
      </span>
      <span title={`Portfolio activity ${pp(activity)}`} className={`${base} bg-activity/15 text-activity`}>
        A {ppNum(activity)}
      </span>
    </>
  );
}

/** L-shaped brackets on a panel's four corners. The parent must be `relative`. */
export function Corners() {
  const c = "pointer-events-none absolute h-2.5 w-2.5 border-muted/70";
  return (
    <>
      <span aria-hidden className={`${c} -left-px -top-px rounded-tl-md border-l border-t`} />
      <span aria-hidden className={`${c} -right-px -top-px rounded-tr-md border-r border-t`} />
      <span aria-hidden className={`${c} -bottom-px -left-px rounded-bl-md border-b border-l`} />
      <span aria-hidden className={`${c} -bottom-px -right-px rounded-br-md border-b border-r`} />
    </>
  );
}

/** Two thin diverging bars from a centre line: price on top, portfolio activity below. */
export function SplitBars({ price, activity, scale }: { price: number; activity: number; scale: number }) {
  const s = Math.max(scale, 1e-9);
  const bar = (v: number, color: string) => {
    const width = `${Math.min(Math.abs(v) / s, 1) * 50}%`;
    return (
      <span className="relative block h-1.5 rounded-full bg-white/5">
        <span
          className={`absolute inset-y-0 rounded-full ${color}`}
          style={v >= 0 ? { left: "50%", width } : { right: "50%", width }}
        />
      </span>
    );
  };
  return (
    <span className="relative block space-y-1">
      <span aria-hidden className="absolute -inset-y-0.5 left-1/2 w-px bg-white/15" />
      {bar(price, "bg-price")}
      {bar(activity, "bg-activity")}
    </span>
  );
}
