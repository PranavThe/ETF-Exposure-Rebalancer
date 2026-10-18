"use client";

import { useState } from "react";

import { pct, pp } from "@/lib/format";
import { SECTORS, UNCLASSIFIED, sectorColor, toMix, usd, type Mix, type PlanFund } from "@/lib/planner";

import { AnimatedNumber, SectionHeader, TextTabs } from "./ui";

const SIZE = 216;
const C = SIZE / 2;
const SHOWN_BY_DEFAULT = 0.005; // sectors under 0.5% now and in the target fold away

/** One ring of the donut: a circle per sector, drawn with dash offsets so changes glide. */
function Ring({ mix, r, width, hover, onHover, dim = false }: { mix: Mix; r: number; width: number; hover: string | null; onHover: (s: string | null) => void; dim?: boolean }) {
  const circ = 2 * Math.PI * r;
  const order = [...SECTORS, UNCLASSIFIED];
  const total = order.reduce((a, s) => a + (mix[s] ?? 0), 0) || 1;
  let start = 0;
  return (
    <g transform={`rotate(-90 ${C} ${C})`}>
      <circle cx={C} cy={C} r={r} fill="none" stroke="var(--color-panel-3)" strokeWidth={width} opacity={0.5} />
      {order.map((s) => {
        const frac = (mix[s] ?? 0) / total;
        const len = Math.max(0, frac * circ - (frac > 0.004 ? 2 : 0));
        const seg = (
          <circle
            key={s}
            className="arc-anim cursor-pointer"
            cx={C}
            cy={C}
            r={r}
            fill="none"
            stroke={sectorColor(s)}
            strokeWidth={hover === s ? width + 3 : width}
            strokeDasharray={`${len} ${circ}`}
            strokeDashoffset={-start * circ}
            opacity={(hover && hover !== s ? 0.2 : 1) * (dim ? 0.5 : 1)}
            onMouseEnter={() => onHover(s)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{`${s} ${pct(frac)}`}</title>
          </circle>
        );
        start += frac;
        return seg;
      })}
    </g>
  );
}

function Donut({ current, target, hover, onHover, match }: { current: Mix; target: Mix | null; hover: string | null; onHover: (s: string | null) => void; match: number | null }) {
  const empty = Object.values(current).every((v) => !v) && !target;
  const now = hover ? current[hover] ?? 0 : 0;
  const want = hover && target ? target[hover] ?? 0 : null;
  return (
    <div className="relative aspect-square w-[176px] shrink-0 @[60rem]:w-[216px]">
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Sector mix: inner ring now, outer ring your target">
        {empty ? (
          <>
            <circle cx={C} cy={C} r={96} fill="none" stroke="var(--color-panel-3)" strokeWidth={8} opacity={0.6} />
            <circle cx={C} cy={C} r={78} fill="none" stroke="var(--color-panel-2)" strokeWidth={14} />
          </>
        ) : (
          <>
            <Ring mix={target ?? current} r={96} width={8} hover={hover} onHover={onHover} dim={!target} />
            <Ring mix={current} r={78} width={15} hover={hover} onHover={onHover} />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {empty ? (
          <span className="max-w-[110px] text-xs leading-relaxed text-faint">Your sector mix appears here</span>
        ) : hover ? (
          <div key={hover} className="animate-fade-in">
            <p className="max-w-[120px] text-xs text-muted">{hover}</p>
            <p className="mt-1 font-mono text-2xl tabular-nums text-fg">{pct(now)}</p>
            {want !== null && <p className="mt-0.5 font-mono text-xs text-faint">target {pct(want)}</p>}
          </div>
        ) : (
          <div>
            <p className="text-[11px] text-faint">{match !== null ? "Match" : "Sectors"}</p>
            {match !== null ? (
              <AnimatedNumber value={match} format={(v) => pct(v)} className="mt-0.5 block font-mono text-[26px] text-fg" />
            ) : (
              <p className="mt-0.5 font-mono text-[26px] text-fg">{Object.values(current).filter((v) => v > 0.0005).length}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.0005) return <span className="text-faint">—</span>;
  return <span className={value > 0 ? "text-up" : "text-down"}>{pp(value)}</span>;
}

/** The sector mix now and the target, with a handle per sector. */
export default function MixSection({
  current,
  target,
  match,
  matchAfter,
  funds,
  hasHoldings,
  onSector,
  onReset,
}: {
  current: Mix;
  target: Mix | null;
  match: number | null;
  matchAfter: number | null;
  funds: PlanFund[];
  hasHoldings: boolean;
  onSector: (sector: string, value: number) => void;
  onReset: () => void;
}) {
  const [view, setView] = useState("sectors");
  const [hover, setHover] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = target ?? current;
  const unclassified = current[UNCLASSIFIED] ?? 0;
  const essential = SECTORS.filter((s) => (current[s] ?? 0) >= SHOWN_BY_DEFAULT || (target?.[s] ?? 0) >= SHOWN_BY_DEFAULT);
  const rows = showAll || !hasHoldings || essential.length === 0 ? [...SECTORS] : essential;
  const hidden = SECTORS.length - rows.length;

  return (
    <section className="flex flex-1 flex-col xl:min-h-0">
      <SectionHeader
        title="Your sector mix"
        sub={
          !hasHoldings
            ? "Add ETFs on the left to see what you really own."
            : target
              ? "Inner ring is now, outer ring is your target."
              : "Drag a handle to set the mix you want, or tell Scythe."
        }
        right={
          <>
            {target && (
              <button type="button" onClick={onReset} className="text-[12.5px] text-muted transition-colors hover:text-fg">
                Reset target
              </button>
            )}
            <TextTabs
              label="Mix view"
              active={view}
              onTab={setView}
              tabs={[
                { id: "sectors", label: "Sectors" },
                { id: "etfs", label: "By ETF" },
              ]}
            />
          </>
        }
      />

      <div className="@container px-6 pb-5 xl:min-h-0 xl:flex-1 xl:overflow-auto">
        {view === "sectors" ? (
          <div className="flex flex-col items-center gap-6 @[36rem]:flex-row @[36rem]:items-start @[36rem]:gap-7 @[60rem]:gap-12">
            <div className="flex shrink-0 flex-col items-center gap-4 @[36rem]:pt-1">
              <Donut current={current} target={target} hover={hover} onHover={setHover} match={match} />
              {match !== null && matchAfter !== null && matchAfter > match + 0.0005 && (
                <p className="font-mono text-[13px] text-up">→ {pct(matchAfter)} after the best moves</p>
              )}
            </div>

            <div className="@container/table w-full min-w-0 max-w-[880px] flex-1">
              <div className="grid grid-cols-[minmax(80px,120px)_minmax(80px,1fr)_46px] gap-2.5 border-b @[18rem]/table:grid-cols-[minmax(84px,120px)_minmax(60px,1fr)_46px_46px] @[25rem]/table:grid-cols-[minmax(90px,150px)_minmax(70px,1fr)_48px_48px_60px] border-line pb-2 text-[11.5px] text-faint">
                <span>Sector</span>
                <span>{target ? "Now → target" : "Drag to set a target"}</span>
                <span className="hidden text-right @[18rem]/table:block">Now</span>
                <span className="text-right">Target</span>
                <span className="hidden text-right @[25rem]/table:block">Change</span>
              </div>
              <ul>
                {rows.map((sector) => {
                  const now = current[sector] ?? 0;
                  const want = shown[sector] ?? 0;
                  const lo = Math.min(now, want);
                  const hi = Math.max(now, want);
                  const up = want > now;
                  const lit = hover === sector;
                  return (
                    <li
                      key={sector}
                      onMouseEnter={() => setHover(sector)}
                      onMouseLeave={() => setHover(null)}
                      className={`grid grid-cols-[minmax(80px,120px)_minmax(80px,1fr)_46px] items-center gap-2.5 @[18rem]/table:grid-cols-[minmax(84px,120px)_minmax(60px,1fr)_46px_46px] @[25rem]/table:grid-cols-[minmax(90px,150px)_minmax(70px,1fr)_48px_48px_60px] border-b border-line/50 py-2 text-[13.5px] transition-colors ${lit ? "bg-panel/60" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: sectorColor(sector) }} />
                        <span className="truncate text-fg/90" title={sector}>
                          {sector}
                        </span>
                      </span>
                      <span className="relative h-6">
                        <span className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-panel-3" />
                        <span
                          className="bar-anim absolute left-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full"
                          style={{ width: `${now * 100}%`, background: sectorColor(sector), opacity: 0.8 }}
                        />
                        {target && hi - lo > 0.0005 && (
                          // The change band: drawn without a transition so it follows the handle exactly.
                          <span
                            className={`absolute top-1/2 h-[5px] -translate-y-1/2 ${up ? "bg-up/70" : "bg-down/70"}`}
                            style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
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
                          className={`target-range absolute inset-0 w-full ${target ? "" : "target-idle"}`}
                        />
                      </span>
                      <span className="hidden text-right font-mono tabular-nums text-muted @[18rem]/table:block">{hasHoldings ? pct(now) : "–"}</span>
                      <span className={`text-right font-mono tabular-nums ${target ? "text-fg" : "text-faint"}`}>{target || hasHoldings ? pct(want) : "–"}</span>
                      <span className="hidden text-right font-mono text-[12.5px] tabular-nums @[25rem]/table:block">{target && hasHoldings ? <Delta value={want - now} /> : <span className="text-faint">—</span>}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex items-center justify-between text-[12.5px]">
                {hidden > 0 || showAll ? (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="text-muted transition-colors hover:text-fg">
                    {showAll ? "Show fewer sectors" : `Show all sectors (${hidden} more)`}
                  </button>
                ) : (
                  <span />
                )}
                {unclassified > 0.0005 && <span className="text-faint">{pct(unclassified)} of holdings have no sector label yet</span>}
              </div>
            </div>
          </div>
        ) : funds.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">Add ETFs to see what each one holds.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {funds.map((f) => {
              const mix = toMix(f.sectors);
              return (
                <li key={f.ticker} className="py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[14px] font-semibold">{f.ticker}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{f.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted">{usd(f.amount)}</span>
                  </div>
                  {f.status === "missing" ? (
                    <p className="mt-1 text-xs text-faint">No holdings data yet.</p>
                  ) : (
                    <>
                      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-panel-3">
                        {[...SECTORS, UNCLASSIFIED].map((s) =>
                          (mix[s] ?? 0) > 0 ? (
                            <div key={s} className="bar-anim h-full" style={{ width: `${mix[s] * 100}%`, background: sectorColor(s) }} title={`${s} ${pct(mix[s])}`} />
                          ) : null,
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-[11.5px] text-faint">
                        {f.sectors
                          .filter((s) => s.weight >= 0.04)
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
    </section>
  );
}
