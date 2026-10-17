"use client";

import { useState } from "react";

import type { HoldingRow, Holdings, Snapshot } from "@/lib/api";
import { holdingsUrl } from "@/lib/api";
import { money, pct, shares } from "@/lib/format";

import { EmptyState, UnderlineTabs, longDate, stamp, usd } from "./kit";

type Tab = "holdings" | "sectors" | "snapshots";

const ASSET_CLASS: Record<string, string> = {
  equity: "text-muted bg-panel-3",
  cash: "text-up bg-up/10",
  other: "text-activity bg-activity/10",
};

function Th({ children, right = false, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={`label sticky top-0 z-10 bg-panel px-3 py-2.5 font-normal whitespace-nowrap ${right ? "text-right" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

function WeightCell({ value, max }: { value: number | null; max: number }) {
  if (value === null) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1 w-14 overflow-hidden rounded-full bg-panel-3 sm:inline-flex">
        <span className="rounded-full bg-accent-strong" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="w-12 text-right">{pct(value)}</span>
    </span>
  );
}

function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  const max = Math.max(0, ...rows.map((h) => h.reported_weight ?? 0));
  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full text-sm md:min-w-[820px]">
        <thead>
          <tr className="border-b border-line">
            <Th className="pl-4">Security</Th>
            <Th className="hidden md:table-cell">Sector</Th>
            <Th className="hidden md:table-cell">Asset class</Th>
            <Th right className="hidden md:table-cell">
              Shares
            </Th>
            <Th right className="hidden md:table-cell">
              Price
            </Th>
            <Th right>Market value</Th>
            <Th right className="pr-4">
              <span className="md:hidden">Weight</span>
              <span className="hidden md:inline">Reported weight</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.security_id} className="border-b border-line/60 hover:bg-panel-2">
              <td className="max-w-[160px] py-2.5 pr-3 pl-4 md:max-w-[300px]">
                <div className="truncate font-semibold">
                  {h.ticker || <span className="font-mono text-[13px] font-normal text-muted">{h.security_id}</span>}
                </div>
                <div className="truncate text-xs text-muted" title={h.name}>
                  {h.name}
                </div>
              </td>
              <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted md:table-cell">
                {h.sector}
                {h.source_sector && h.source_sector !== h.sector && (
                  <span className="ml-1 text-[11px] text-faint" title="Sector as published by the issuer">
                    ({h.source_sector})
                  </span>
                )}
              </td>
              <td className="hidden px-3 py-2.5 md:table-cell">
                <span className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${ASSET_CLASS[h.asset_class] ?? ASSET_CLASS.equity}`}>
                  {h.asset_class}
                </span>
              </td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-[13px] tabular-nums md:table-cell">{shares(h.shares)}</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-[13px] text-muted tabular-nums md:table-cell">
                {usd(h.price)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums">{money(h.market_value)}</td>
              <td className="py-2.5 pr-4 pl-3 text-right font-mono text-[13px] tabular-nums">
                <WeightCell value={h.reported_weight} max={max} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectorsTable({ rows }: { rows: HoldingRow[] }) {
  const map = new Map<string, { weight: number; count: number; value: number }>();
  for (const h of rows) {
    const cur = map.get(h.sector) ?? { weight: 0, count: 0, value: 0 };
    cur.weight += h.reported_weight ?? 0;
    cur.count += 1;
    cur.value += h.market_value;
    map.set(h.sector, cur);
  }
  const sectors = [...map.entries()].sort((a, b) => b[1].weight - a[1].weight || b[1].value - a[1].value);
  const max = Math.max(0, ...sectors.map(([, s]) => s.weight));
  const total = sectors.reduce((sum, [, s]) => sum + s.weight, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm sm:min-w-[560px]">
        <thead>
          <tr className="border-b border-line">
            <Th className="pl-4">Sector</Th>
            <Th right>Rows</Th>
            <Th right className="hidden sm:table-cell">
              Market value
            </Th>
            <Th right>Weight</Th>
            <Th className="w-[30%] pr-4 sm:w-[38%]">
              <span className="sr-only">Bar</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {sectors.map(([name, s]) => (
            <tr key={name} className="border-b border-line/60 hover:bg-panel-2">
              <td className="py-2.5 pr-3 pl-4">{name}</td>
              <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted tabular-nums">{s.count}</td>
              <td className="hidden px-3 py-2.5 text-right font-mono text-[13px] text-muted tabular-nums sm:table-cell">
                {money(s.value)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums">{pct(s.weight)}</td>
              <td className="py-2.5 pr-4 pl-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
                  <div className="h-full rounded-full bg-accent-strong" style={{ width: `${max > 0 ? (s.weight / max) * 100 : 0}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-2.5 pr-3 pl-4 text-xs text-faint sm:hidden" colSpan={2}>
              Reported weights by sector, cash and other included.
            </td>
            <td className="hidden py-2.5 pr-3 pl-4 text-xs text-faint sm:table-cell" colSpan={3}>
              Reported weights summed by resolved sector, cash and other rows included.
            </td>
            <td className="px-3 py-2.5 text-right font-mono text-[13px] text-muted tabular-nums">{pct(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SnapshotsTable({ fund, snapshots }: { fund: string; snapshots: Snapshot[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-line">
            <Th className="pl-4">As of</Th>
            <Th right>Rows</Th>
            <Th>Source</Th>
            <Th>Content hash (SHA-256)</Th>
            <Th className="pr-4">Ingested</Th>
          </tr>
        </thead>
        <tbody>
          {[...snapshots].reverse().map((s) => (
            <tr key={s.as_of_date} className="border-b border-line/60 align-top hover:bg-panel-2">
              <td className="py-2.5 pr-3 pl-4 whitespace-nowrap">
                <div>{longDate(s.as_of_date)}</div>
                <a
                  href={holdingsUrl(fund, s.as_of_date)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  JSON ↗
                </a>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums">{s.row_count}</td>
              <td className="max-w-[260px] px-3 py-2.5">
                {s.source_url ? (
                  <a href={s.source_url} target="_blank" rel="noreferrer" className="block truncate text-accent hover:underline" title={s.source_url}>
                    {s.source_url}
                  </a>
                ) : (
                  <span className="text-muted">Synthetic sample file</span>
                )}
                <div className="truncate font-mono text-[11px] text-faint" title={s.source_file}>
                  {s.source_file}
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-[11px] break-all text-muted">{s.content_hash}</td>
              <td className="py-2.5 pr-4 pl-3 font-mono text-xs whitespace-nowrap text-muted">{stamp(s.ingested_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The bottom of the profile: holdings, sector weights and snapshot records under underline tabs. */
export default function HoldingsSection({
  fund,
  snapshots,
  date,
  holdings,
  error,
  onDate,
}: {
  fund: string;
  snapshots: Snapshot[];
  date: string | null;
  holdings: Holdings | undefined;
  error?: string;
  onDate: (date: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("holdings");
  const [search, setSearch] = useState("");
  const [equityOnly, setEquityOnly] = useState(false);

  const all = holdings?.holdings ?? [];
  const nonEquity = all.filter((h) => h.asset_class !== "equity").length;
  const q = search.trim().toLowerCase();
  const rows = all.filter(
    (h) =>
      (!equityOnly || h.asset_class === "equity") &&
      (!q ||
        h.ticker.toLowerCase().includes(q) ||
        h.name.toLowerCase().includes(q) ||
        h.sector.toLowerCase().includes(q) ||
        h.security_id.toLowerCase().includes(q)),
  );
  const sectorCount = new Set(all.map((h) => h.sector)).size;

  return (
    <section className="min-w-0">
      <div className="flex items-end justify-between gap-4 border-b border-line">
        <UnderlineTabs
          label="Fund details"
          tabs={[
            { id: "holdings", label: "Holdings", count: holdings ? all.length : undefined },
            { id: "sectors", label: "Sectors", count: holdings ? sectorCount : undefined },
            { id: "snapshots", label: "Snapshots", count: snapshots.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        {date && (
          <a
            href={holdingsUrl(fund, date)}
            target="_blank"
            rel="noreferrer"
            className="mb-2.5 hidden shrink-0 text-xs text-muted hover:text-fg sm:inline"
          >
            View raw JSON ↗
          </a>
        )}
      </div>

      {tab !== "snapshots" && (
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Snapshot date</span>
              <select
                value={date ?? ""}
                onChange={(e) => onDate(e.target.value)}
                className="h-8 appearance-none rounded-md border border-line bg-panel pr-8 pl-3 font-mono text-xs text-fg hover:border-line-2 focus:border-line-2 focus:outline-none"
              >
                {[...snapshots].reverse().map((s) => (
                  <option key={s.as_of_date} value={s.as_of_date}>
                    As of {s.as_of_date}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-faint">
                ▾
              </span>
            </label>
            {tab === "holdings" && (
              <button
                type="button"
                onClick={() => setEquityOnly((v) => !v)}
                aria-pressed={equityOnly}
                disabled={nonEquity === 0}
                title={nonEquity === 0 ? "This snapshot has only equity rows" : undefined}
                className={`h-8 rounded-md border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  equityOnly ? "border-accent/50 bg-accent-strong/20 text-fg" : "border-line bg-panel text-muted hover:text-fg"
                }`}
              >
                {equityOnly ? "Show" : "Hide"} cash &amp; other{nonEquity ? ` (${nonEquity})` : ""}
              </button>
            )}
            {date && (
              <a href={holdingsUrl(fund, date)} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-fg sm:hidden">
                View raw JSON ↗
              </a>
            )}
          </div>
          {tab === "holdings" && (
            <div className="relative sm:w-72">
              <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" />
                <path d="m10.5 10.5 3 3" stroke="currentColor" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search holdings…"
                aria-label="Search holdings"
                className="h-8 w-full rounded-md border border-line bg-panel pr-3 pl-8 text-sm placeholder:text-faint focus:border-line-2 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      <div className={`overflow-hidden rounded-md border border-line bg-panel ${tab === "snapshots" ? "mt-3" : ""}`}>
        {tab === "snapshots" ? (
          <SnapshotsTable fund={fund} snapshots={snapshots} />
        ) : error ? (
          <p className="p-4 text-sm text-down">{error}</p>
        ) : !holdings ? (
          <div className="space-y-2 p-4" aria-busy>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-panel-2" />
            ))}
          </div>
        ) : tab === "sectors" ? (
          <SectorsTable rows={all} />
        ) : rows.length === 0 ? (
          <EmptyState title={q ? `No holdings match “${search.trim()}”` : "No holdings in this snapshot"}>
            {q && (
              <button type="button" onClick={() => setSearch("")} className="text-accent hover:underline">
                Clear search
              </button>
            )}
          </EmptyState>
        ) : (
          <HoldingsTable rows={rows} />
        )}
      </div>
      {holdings && tab === "holdings" && (
        <p className="mt-2 text-xs text-faint">
          {rows.length} of {all.length} rows as of {longDate(holdings.snapshot.as_of_date)}. Weights are as published in the
          source file.
        </p>
      )}
    </section>
  );
}
