"use client";

import { useState } from "react";

import { pct, pp } from "@/lib/format";
import { SECTORS, UNCLASSIFIED, sectorColor, toMix, usd, type Mix, type PlanFund } from "@/lib/planner";

import { AnimatedNumber, Pane } from "./ui";

const SIZE = 212;
const C = SIZE / 2;

/** One ring of the donut: a circle per sector, drawn with dash offsets so changes glide. */
function Ring({ mix, r, width, hover, onHover, dim = false }: { mix: Mix; r: number; width: number; hover: string | null; onHover: (s: string | null) => void; dim?: boolean }) {
  const circ = 2 * Math.PI * r;
  const order = [...SECTORS, UNCLASSIFIED];
  const total = order.reduce((a, s) => a + (mix[s] ?? 0), 0) || 1;
  let start = 0;
  return (
    <g transform={`rotate(-90 ${C} ${C})`}>
      <circle cx={C} cy={C} r={r} fill="none" stroke="var(--color-panel-3)" strokeWidth={width} opacity={0.6} />
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
            strokeWidth={hover === s ? width + 4 : width}
            strokeDasharray={`${len} ${circ}`}
            strokeDashoffset={-start * circ}
            opacity={(hover && hover !== s ? 0.18 : 1) * (dim ? 0.55 : 1)}
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
  const now = hover ? current[hover] ?? 0 : null;
  const want = hover && target ? target[hover] ?? 0 : null;
  return (
    <div className="relative mx-auto shrink-0" style={{ width: SIZE, height: SIZE }}>
      <div aria-hidden className="absolute inset-6 rounded-full bg-accent-strong/10 blur-2xl" />
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative" role="img" aria-label="Sector mix: inner ring now, outer ring your target">
        {empty ? (
          <>
            <circle cx={C} cy={C} r={94} fill="none" stroke="var(--color-panel-3)" strokeWidth={10} />
            <circle cx={C} cy={C} r={76} fill="none" stroke="var(--color-panel-2)" strokeWidth={14} />
          </>
        ) : (
          <>
            <Ring mix={target ?? current} r={94} width={9} hover={hover} onHover={onHover} dim={!target} />
            <Ring mix={current} r={76} width={16} hover={hover} onHover={onHover} />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {empty ? (
          <span className="max-w-[120px] text-xs leading-relaxed text-faint">Your sector mix appears here</span>
        ) : hover ? (
          <div key={hover} className="animate-fade-in">
            <p className="max-w-[130px] text-xs text-muted">{hover}</p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-fg">{pct(now ?? 0)}</p>
            {want !== null && (
              <p className="mt-0.5 font-mono text-xs text-faint">
                target {pct(want)}{" "}
                <span className={want - (now ?? 0) > 0.0005 ? "text-up" : want - (now ?? 0) < -0.0005 ? "text-down" : ""}>{pp(want - (now ?? 0))}</span>
              </p>
            )}
          </div>
        ) : match !== null ? (
          <div className="animate-fade-in">
            <p className="label">Target match</p>
            <AnimatedNumber value={match} format={(v) => pct(v)} className="mt-1 block font-mono text-[28px] font-medium text-fg" />
          </div>
        ) : (
          <div className="animate-fade-in">
            <p className="label">Sectors</p>
            <p className="mt-1 font-mono text-[28px] font-medium text-fg">{Object.values(current).filter((v) => v > 0.0005).length}</p>
            <p className="mt-0.5 text-[11px] text-faint">drag a slider to set a target</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.0005) return <span className="text-faint">on target</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-up" : "text-down"}`}>
      <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M5 1 9 8H1z" fill="currentColor" />
      </svg>
      {pp(Math.abs(value)).replace("+", "")}
    </span>
  );
}

/** Centre: the sector mix now, the target, and a slider per sector. */
export default function ExposurePanel({
  current,
  target,
  preview,
  match,
  funds,
  hasHoldings,
  onSector,
  onReset,
}: {
  current: Mix;
  target: Mix | null;
  preview: Mix | null;
  match: number | null;
  funds: PlanFund[];
  hasHoldings: boolean;
  onSector: (sector: string, value: number) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState("mix");
  const [hover, setHover] = useState<string | null>(null);
  const shown = target ?? current;
  const unclassified = current[UNCLASSIFIED] ?? 0;

  return (
    <Pane
      tabs={[
        { id: "mix", label: "Sector exposure" },
        { id: "etfs", label: "By ETF", badge: funds.length || undefined },
      ]}
      active={tab}
      onTab={setTab}
      className="min-h-[560px] lg:min-h-0 lg:flex-[3]"
      right={
        target ? (
          <button type="button" onClick={onReset} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-line-2 hover:text-fg">
            Reset target
          </button>
        ) : (
          <span className="hidden text-[12px] xl:inline">Drag a handle or ask the assistant</span>
        )
      }
    >
      {tab === "mix" ? (
        <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start xl:gap-5">
          <div className="flex flex-col items-center xl:sticky xl:top-4 xl:pt-2">
            <Donut current={current} target={target} hover={hover} onHover={setHover} match={match} />
            <div className="mt-3 flex items-center gap-4 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-[3px] border-muted/70" /> now
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-accent" /> target
              </span>
              {preview && (
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-3 rounded-full bg-up" /> after moves
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 grid grid-cols-[minmax(96px,156px)_minmax(80px,1fr)_48px_48px_66px] items-end gap-2.5 px-2">
              <span className="label">Sector</span>
              <span className="label">{target ? "Now vs target" : "Drag to set"}</span>
              <span className="label text-right">Now</span>
              <span className="label text-right">Target</span>
              <span className="label text-right">Change</span>
            </div>
            <ul>
              {SECTORS.map((sector, i) => {
                const now = current[sector] ?? 0;
                const want = shown[sector] ?? 0;
                const after = preview?.[sector];
                const lit = hover === sector;
                return (
                  <li
                    key={sector}
                    onMouseEnter={() => setHover(sector)}
                    onMouseLeave={() => setHover(null)}
                    className={`grid animate-fade-up grid-cols-[minmax(96px,156px)_minmax(80px,1fr)_48px_48px_66px] items-center gap-2.5 rounded-md px-2 py-[5px] text-[13px] transition-colors ${lit ? "bg-panel-2" : ""}`}
                    style={{ animationDelay: `${i * 25}ms` }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: sectorColor(sector) }} />
                      <span className={`truncate ${lit ? "text-fg" : "text-fg/90"}`} title={sector}>
                        {sector}
                      </span>
                    </span>
                    <span className="relative h-[22px]">
                      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-panel-3" />
                      <span
                        className="bar-anim absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                        style={{
                          width: `${now * 100}%`,
                          background: `linear-gradient(90deg, color-mix(in srgb, ${sectorColor(sector)} 45%, transparent), ${sectorColor(sector)})`,
                        }}
                      />
                      {after !== undefined && (
                        <span
                          className="bar-anim absolute left-0 top-[calc(50%+5px)] h-[2px] rounded-full bg-up"
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
                        className={`target-range absolute inset-0 w-full ${target ? "" : "target-idle"}`}
                      />
                    </span>
                    <span className="text-right font-mono tabular-nums text-muted">{hasHoldings ? pct(now) : "–"}</span>
                    <span className={`text-right font-mono tabular-nums ${target ? "text-fg" : "text-faint"}`}>{target || hasHoldings ? pct(want) : "–"}</span>
                    <span className="text-right font-mono text-[12px] tabular-nums">
                      {target && hasHoldings ? <Delta value={want - now} /> : <span className="text-faint">–</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {unclassified > 0.0005 && (
              <p className="mt-3 px-2 text-[11px] leading-relaxed text-faint">
                {pct(unclassified)} of your holdings have no sector label yet and can’t be targeted.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4">
          {funds.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Add ETFs to see what each one holds.</p>
          ) : (
            <ul className="space-y-4">
              {funds.map((f, i) => {
                const mix = toMix(f.sectors);
                return (
                  <li key={f.ticker} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[14px] font-semibold">{f.ticker}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">{f.name}</span>
                      <span className="font-mono text-xs tabular-nums text-muted">{usd(f.amount)}</span>
                    </div>
                    {f.status === "missing" ? (
                      <p className="mt-1 text-xs text-faint">No holdings data yet.</p>
                    ) : (
                      <>
                        <div className="mt-2 flex h-3.5 overflow-hidden rounded bg-panel-3">
                          {[...SECTORS, UNCLASSIFIED].map((s) =>
                            (mix[s] ?? 0) > 0 ? (
                              <div
                                key={s}
                                className="bar-anim h-full border-r border-panel last:border-r-0"
                                style={{ width: `${mix[s] * 100}%`, background: sectorColor(s) }}
                                title={`${s} ${pct(mix[s])}`}
                              />
                            ) : null,
                          )}
                        </div>
                        <p className="mt-1.5 truncate text-[11px] text-faint">
                          {f.sectors
                            .filter((s) => s.weight >= 0.04)
                            .sort((a, b) => b.weight - a.weight)
                            .map((s) => `${s.sector} ${pct(s.weight, 0)}`)
                            .join(" · ")}
                          {f.as_of_date ? ` · as of ${f.as_of_date}` : ""}
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
    </Pane>
  );
}
