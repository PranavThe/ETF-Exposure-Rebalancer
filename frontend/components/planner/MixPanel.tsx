"use client";

import { useState } from "react";

import Panel from "@/components/ui/Panel";
import { pct, pp, ppDistance } from "@/lib/format";
import { SECTORS, UNCLASSIFIED, sectorColor, toMix, usd, type Mix, type PlanFund } from "@/lib/planner";

function Diff({ value }: { value: number }) {
  if (Math.abs(value) < 0.0005) return <span className="text-faint">on target</span>;
  return <span className={value > 0 ? "text-up" : "text-down"}>{pp(value)}</span>;
}

/** Centre column: the portfolio's sector mix, with a slider per sector for the target. */
export default function MixPanel({
  current,
  target,
  preview,
  distance,
  funds,
  hasHoldings,
  onSector,
  onReset,
}: {
  current: Mix;
  target: Mix | null;
  preview: Mix | null;
  distance: number | null;
  funds: PlanFund[];
  hasHoldings: boolean;
  onSector: (sector: string, value: number) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState("mix");
  const shown = target ?? current;
  const unclassified = current[UNCLASSIFIED] ?? 0;

  return (
    <Panel
      tabs={[
        { id: "mix", label: "Sector mix" },
        { id: "etfs", label: "By ETF" },
      ]}
      active={tab}
      onTab={setTab}
      className="lg:h-full"
      right={
        target ? (
          <>
            <span className="hidden sm:inline">
              {distance !== null ? <><span className="font-mono text-fg">{ppDistance(distance)}</span> from your target</> : "Target set"}
            </span>
            <button type="button" onClick={onReset} className="rounded border border-line px-2 py-0.5 hover:text-fg">
              Reset
            </button>
          </>
        ) : (
          <span className="hidden sm:inline">Drag a slider or tell the assistant what you want</span>
        )
      }
    >
      {tab === "mix" ? (
        <div className="px-4 py-3">
          <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_64px_64px_72px] gap-3 sm:grid">
            <span className="label">Sector</span>
            <span className="label text-right">Now</span>
            <span className="label text-right">Target</span>
            <span className="label text-right">Change</span>
          </div>
          <ul className="space-y-2.5">
            {SECTORS.map((sector) => {
              const now = current[sector] ?? 0;
              const want = shown[sector] ?? 0;
              const after = preview?.[sector];
              return (
                <li key={sector}>
                  <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_64px] items-baseline gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_64px_64px_72px] sm:gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: sectorColor(sector) }} />
                      <span className="truncate">{sector}</span>
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-muted">{hasHoldings ? pct(now) : "–"}</span>
                    <span className={`text-right font-mono text-xs tabular-nums ${target ? "text-fg" : "text-faint"}`}>
                      {target || hasHoldings ? pct(want) : "–"}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums">
                      {target && hasHoldings ? <Diff value={want - now} /> : <span className="text-faint">–</span>}
                    </span>
                  </div>
                  <div className="relative mt-1 h-4">
                    <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-panel-3" />
                    <div
                      className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                      style={{ width: `${now * 100}%`, background: sectorColor(sector), opacity: 0.75 }}
                    />
                    {after !== undefined && (
                      <div
                        className="absolute left-0 top-[calc(50%+5px)] h-[3px] rounded-full bg-accent"
                        style={{ width: `${after * 100}%` }}
                        title={`After these moves: ${pct(after)}`}
                      />
                    )}
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.005}
                      value={want}
                      onChange={(e) => onSector(sector, Number(e.target.value))}
                      aria-label={`Target for ${sector}`}
                      aria-valuetext={pct(want)}
                      className={`mix-range absolute inset-0 w-full ${target ? "" : "mix-range-idle"}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-muted/60" />now</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-accent bg-fg" />your target</span>
            {preview && <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-accent" />after the selected moves</span>}
            {unclassified > 0.0005 && <span>{pct(unclassified)} of holdings have no sector label and can’t be targeted.</span>}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3">
          {funds.length === 0 ? (
            <p className="text-sm text-muted">Add ETFs to see what each one holds.</p>
          ) : (
            <ul className="space-y-4">
              {funds.map((f) => {
                const mix = toMix(f.sectors);
                return (
                  <li key={f.ticker}>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="font-mono font-semibold">{f.ticker}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{f.name}</span>
                      <span className="font-mono text-xs tabular-nums text-muted">{usd(f.amount)}</span>
                    </div>
                    {f.status === "missing" ? (
                      <p className="mt-1 text-xs text-faint">No holdings data yet.</p>
                    ) : (
                      <>
                        <div className="mt-1.5 flex h-3 overflow-hidden rounded-sm bg-panel-3">
                          {[...SECTORS, UNCLASSIFIED].map((s) =>
                            (mix[s] ?? 0) > 0 ? (
                              <div key={s} style={{ width: `${mix[s] * 100}%`, background: sectorColor(s) }} title={`${s} ${pct(mix[s])}`} />
                            ) : null,
                          )}
                        </div>
                        <p className="mt-1 truncate text-[11px] text-faint">
                          {f.sectors
                            .filter((s) => s.weight >= 0.05)
                            .sort((a, b) => b.weight - a.weight)
                            .map((s) => `${s.sector} ${pct(s.weight, 0)}`)
                            .join(" · ")}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
