"use client";

import { pct } from "@/lib/format";
import { sectorColor, usd, type CoveredEtf } from "@/lib/planner";

import { AnimatedNumber } from "./ui";

/** A slow tape of ETFs with sector data, Kairos-discover style. Click one to add it. */
export function TickerTape({ etfs, onPick }: { etfs: CoveredEtf[]; onPick: (etf: { ticker: string; name: string }) => void }) {
  const items = etfs.filter((e) => !e.sample).slice(0, 40);
  if (items.length < 4) return null;
  const row = items.map((e) => {
    const top = e.sectors.slice().sort((a, b) => b.weight - a.weight)[0];
    return { ...e, top };
  });
  return (
    <div className="relative h-9 shrink-0 overflow-hidden border-b border-line bg-canvas/60">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-canvas to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-canvas to-transparent" />
      <div className="ticker-track flex h-full w-max items-center" style={{ animationDuration: `${items.length * 4}s` }}>
        {[...row, ...row].map((e, i) => (
          <button
            key={`${e.ticker}-${i}`}
            type="button"
            onClick={() => onPick({ ticker: e.ticker, name: e.name })}
            title={`Add ${e.ticker} · ${e.name}`}
            tabIndex={i < row.length ? 0 : -1}
            className="group flex h-full items-center gap-2 border-r border-line/70 px-4 text-[13px] transition-colors hover:bg-panel"
          >
            <span className="font-mono font-semibold text-fg">{e.ticker}</span>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sectorColor(e.top?.sector ?? "") }} />
            <span className="text-muted">{e.top?.sector}</span>
            <span className="font-mono text-faint">{pct(e.top?.weight ?? 0, 0)}</span>
            <span className="text-accent opacity-0 transition-opacity group-hover:opacity-100">+</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Cell({ label, children, sub, className = "" }: { label: string; children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col justify-center gap-1 px-4 py-2.5 sm:px-5 ${className}`}>
      <span className="label truncate">{label}</span>
      <span className="truncate text-[19px] font-medium leading-tight text-fg">{children}</span>
      {sub !== undefined && <span className="truncate text-[11px] text-faint">{sub}</span>}
    </div>
  );
}

export function StatStrip({
  total,
  covered,
  etfCount,
  missingCount,
  largest,
  match,
  bestMatch,
  bestMoved,
  asOf,
}: {
  total: number;
  covered: number;
  etfCount: number;
  missingCount: number;
  largest: { sector: string; weight: number } | null;
  match: number | null;
  bestMatch: number | null;
  bestMoved: number | null;
  asOf: string | null;
}) {
  return (
    <div className="grid shrink-0 grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-panel/95 sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
      <Cell label="Portfolio value" sub={missingCount ? `${usd(covered)} with sector data` : "across your ETFs"}>
        <AnimatedNumber value={total} format={(v) => usd(v)} className="font-mono" />
      </Cell>
      <Cell label="ETFs" sub={missingCount ? `${missingCount} without data yet` : etfCount ? "all with sector data" : "add one to start"}>
        <span className="font-mono">{etfCount}</span>
      </Cell>
      <Cell label="Largest sector" sub={largest ? largest.sector : "—"}>
        {largest ? <AnimatedNumber value={largest.weight} format={(v) => pct(v)} className="font-mono" /> : <span className="text-faint">—</span>}
      </Cell>
      <Cell label="Target match" sub={match === null ? "set a target" : "how close you are now"}>
        {match === null ? (
          <span className="text-faint">—</span>
        ) : (
          <AnimatedNumber value={match} format={(v) => pct(v)} className="font-mono" />
        )}
      </Cell>
      <Cell label="After best plan" sub={bestMoved === null ? "no moves yet" : `moves ${usd(bestMoved)}`}>
        {bestMatch === null ? (
          <span className="text-faint">—</span>
        ) : (
          <AnimatedNumber value={bestMatch} format={(v) => pct(v)} className="font-mono text-up" />
        )}
      </Cell>
      <Cell label="Holdings as of" sub="latest published files">
        <span className="font-mono text-[17px]">{asOf ?? "—"}</span>
      </Cell>
    </div>
  );
}
