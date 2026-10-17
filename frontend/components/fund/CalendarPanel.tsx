"use client";

import Link from "next/link";
import { useState } from "react";

import type { Snapshot } from "@/lib/api";
import { shortDate } from "@/lib/format";
import { terminalHref } from "@/lib/hooks";

import { Card, CardHeader, UnderlineTabs, longDate, monthLabel } from "./kit";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The days of a month laid out Sunday-first, padded with nulls to whole weeks. */
function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

type Metric = "rows" | "delta";

function deltaLabel(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "±0";
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

export default function CalendarPanel({
  fund,
  snapshots,
  focus,
  from,
  to,
  onPick,
  onClear,
}: {
  fund: string;
  snapshots: Snapshot[];
  /** The date whose month opens first. */
  focus: string | null;
  from?: string;
  to?: string;
  onPick: (date: string) => void;
  onClear: () => void;
}) {
  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  const [metric, setMetric] = useState<Metric>("rows");
  const [month, setMonth] = useState(() => (focus ?? new Date().toISOString()).slice(0, 7));

  const bySnap = new Map(snapshots.map((s, i) => [s.as_of_date, { s, prev: snapshots[i - 1] ?? null }]));
  const months = Array.from(new Set(snapshots.map((s) => s.as_of_date.slice(0, 7))));
  const countIn = (ym: string) => snapshots.filter((s) => s.as_of_date.startsWith(ym)).length;
  const cells = monthCells(month);

  function pick(date: string) {
    setMonth(date.slice(0, 7));
    onPick(date);
  }

  const metricOf = (date: string): string => {
    const hit = bySnap.get(date);
    if (!hit) return "";
    if (metric === "rows") return String(hit.s.row_count);
    return deltaLabel(hit.prev ? hit.s.row_count - hit.prev.row_count : null);
  };

  const selection = (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
      {from ? (
        <span className="font-mono text-muted">
          <span className="text-fg">{shortDate(from)}</span> → {to ? <span className="text-fg">{shortDate(to)}</span> : "pick To"}
        </span>
      ) : (
        <span className="text-faint">Click two snapshot days to compare</span>
      )}
      {from && (
        <button type="button" onClick={onClear} className="text-faint hover:text-fg">
          Clear
        </button>
      )}
      {from && to && (
        <Link href={terminalHref(fund, from, to)} className="font-medium text-accent hover:underline">
          Compare in terminal →
        </Link>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader
        right={
          tab === "calendar" && (
            <UnderlineTabs
              caps
              label="Value shown in each day"
              tabs={[
                { id: "rows", label: "Rows" },
                { id: "delta", label: "Δ Rows" },
              ]}
              active={metric}
              onChange={setMetric}
            />
          )
        }
      >
        <UnderlineTabs
          caps
          label="Snapshot view"
          tabs={[
            { id: "calendar", label: "Calendar" },
            { id: "list", label: "List", count: snapshots.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </CardHeader>

      {tab === "calendar" ? (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, -1))}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-fg"
              >
                ‹
              </button>
              <span className="min-w-[5.5rem] text-center text-sm font-medium">{monthLabel(month)}</span>
              <button
                type="button"
                onClick={() => setMonth(addMonths(month, 1))}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-panel-2 hover:text-fg"
              >
                ›
              </button>
            </div>
            <label className="relative">
              <span className="sr-only">Jump to a month with snapshots</span>
              <select
                value={months.includes(month) ? month : ""}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="h-7 appearance-none rounded border border-line bg-panel-2 pr-7 pl-2.5 text-xs text-muted hover:text-fg focus:border-line-2 focus:outline-none"
              >
                <option value="" disabled>
                  Months with snapshots
                </option>
                {months.map((ym) => (
                  <option key={ym} value={ym}>
                    {monthLabel(ym)} · {countIn(ym)} snapshot{countIn(ym) === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-faint">
                ▾
              </span>
            </label>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="label pb-1 text-center text-[10px]">
                {d}
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} className="h-12 rounded bg-panel-2/30 sm:h-16" />;
              const day = Number(date.slice(8));
              const snap = bySnap.has(date);
              const isEnd = date === from || date === to;
              const inRange = !!(from && to && date > from && date < to);
              const base = "relative flex h-12 flex-col justify-between rounded p-1.5 text-left sm:h-16 sm:p-2";
              if (!snap) {
                return (
                  <div key={date} className={`${base} ${inRange ? "bg-accent-strong/12" : "bg-panel-2/70"}`}>
                    <span className={`text-[11px] ${inRange ? "text-muted" : "text-faint"}`}>{day}</span>
                  </div>
                );
              }
              const rows = bySnap.get(date)!.s.row_count;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => pick(date)}
                  aria-pressed={isEnd}
                  aria-label={`${longDate(date)}: snapshot with ${rows} rows${date === from ? ", From" : date === to ? ", To" : ""}`}
                  className={`${base} border transition-colors ${
                    isEnd
                      ? "border-accent bg-accent-strong text-white shadow-[0_0_0_1px_rgba(166,161,255,0.35)]"
                      : inRange
                        ? "border-accent/40 bg-accent-strong/20 hover:bg-accent-strong/30"
                        : "border-accent/35 bg-accent/[0.07] hover:border-accent/70 hover:bg-accent/15"
                  }`}
                >
                  <span className="flex items-start justify-between gap-1">
                    <span className={`text-[11px] font-medium ${isEnd ? "text-white" : "text-fg"}`}>{day}</span>
                    {isEnd && (
                      <span className="hidden font-mono text-[9px] tracking-wide text-white/80 uppercase sm:inline">
                        {date === from ? "From" : "To"}
                      </span>
                    )}
                  </span>
                  <span className={`font-mono text-[11px] leading-none tabular-nums ${isEnd ? "text-white" : "text-accent"}`}>
                    {metricOf(date)}
                    {metric === "rows" && <span className={`ml-0.5 hidden md:inline ${isEnd ? "text-white/70" : "text-accent/60"}`}>rows</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-accent/50 bg-accent/10" /> Snapshot
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-accent-strong" /> Selected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-accent-strong/25" /> In range
              </span>
            </div>
            {selection}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label px-4 py-2 font-normal">As of</th>
                  <th className="label px-2 py-2 text-right font-normal">Rows</th>
                  <th className="label px-2 py-2 text-right font-normal">Δ Rows</th>
                  <th className="label px-2 py-2 font-normal">Hash</th>
                  <th className="label px-4 py-2 text-right font-normal">Pick</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().map((s) => {
                  const prev = bySnap.get(s.as_of_date)?.prev ?? null;
                  const marker = s.as_of_date === from ? "From" : s.as_of_date === to ? "To" : null;
                  return (
                    <tr
                      key={s.as_of_date}
                      onClick={() => pick(s.as_of_date)}
                      className={`cursor-pointer border-b border-line/60 hover:bg-panel-2 ${marker ? "bg-accent-strong/10" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[13px]">{s.as_of_date}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-[13px] tabular-nums">{s.row_count}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-[13px] text-muted tabular-nums">
                        {deltaLabel(prev ? s.row_count - prev.row_count : null)}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs text-faint">{s.content_hash.slice(0, 10)}…</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pick(s.as_of_date);
                          }}
                          className={`rounded px-2 py-0.5 font-mono text-[11px] uppercase ${
                            marker ? "bg-accent-strong text-white" : "border border-line text-faint hover:text-fg"
                          }`}
                        >
                          {marker ?? "Select"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-auto border-t border-line px-4 py-3">{selection}</div>
        </div>
      )}
    </Card>
  );
}
