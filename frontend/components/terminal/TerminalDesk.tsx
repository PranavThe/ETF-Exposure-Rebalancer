"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Changes, Snapshot } from "@/lib/api";
import { holdingsUrl } from "@/lib/api";
import { downloadComparisonReport } from "@/lib/export";
import { pp } from "@/lib/format";
import { pickFund, pickRange, useChanges, useFund, useFunds, useQueryState, useSnapshots } from "@/lib/hooks";
import { STATUS, tone } from "@/lib/labels";

import CaveatsBanner from "../CaveatsBanner";
import ConcentrationChart from "../ConcentrationChart";
import DateRangeSelector, { type DateRange } from "../DateRangeSelector";
import EventList from "../EventList";
import FundSelector from "../FundSelector";
import HoldingsTable from "../HoldingsTable";
import Inspector, { type Selection } from "../Inspector";
import SectorChart from "../SectorChart";
import SectorTable from "../SectorTable";
import SourceInfo from "../SourceInfo";
import Notice from "../ui/Notice";
import Panel from "../ui/Panel";

function SnapshotList({ snapshots, range }: { snapshots: Snapshot[]; range: DateRange | null }) {
  return (
    <ul className="mt-2 space-y-0.5">
      {snapshots.map((s) => {
        const marker = s.as_of_date === range?.from ? "FROM" : s.as_of_date === range?.to ? "TO" : "";
        return (
          <li key={s.as_of_date} className="flex items-center justify-between font-mono text-[11px]">
            <span className={marker ? "text-fg" : "text-faint"}>{s.as_of_date}</span>
            <span className={marker ? "text-accent" : "text-faint"}>{marker || `${s.row_count} rows`}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Share of gross weight movement explained by price versus portfolio activity. */
function GrossSplit({ data }: { data: Changes }) {
  let price = 0;
  let activity = 0;
  for (const h of data.holdings) {
    price += Math.abs(h.price_effect);
    activity += Math.abs(h.activity_effect);
  }
  const total = price + activity;
  if (total < 1e-12) {
    return <div className="px-3 py-2 text-xs text-faint">No weight movement in this range.</div>;
  }
  const p = Math.round((price / total) * 100);
  return (
    <div className="flex items-center gap-2 px-3 py-2 font-mono text-[11px]" title="Share of gross weight movement">
      <span className="text-price">price {p}%</span>
      <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3">
        <span className="bg-price" style={{ width: `${p}%` }} />
        <span className="flex-1 bg-activity" />
      </span>
      <span className="text-activity">{100 - p}% activity</span>
    </div>
  );
}

function ChangedPositions({ data, onSelect }: { data: Changes; onSelect: (id: string) => void }) {
  const traded = data.holdings.filter((h) => h.traded);
  if (traded.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted">No position changed size in this range.</p>;
  }
  return (
    <ul className="text-sm">
      {traded.map((h) => (
        <li key={h.security_id}>
          <button
            type="button"
            onClick={() => onSelect(h.security_id)}
            className="grid w-full grid-cols-[1fr_auto_4.75rem] items-center gap-2 border-b border-line/60 px-3 py-2 text-left hover:bg-panel-2"
          >
            <span className="truncate">{h.ticker || h.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS[h.status].className}`}>{STATUS[h.status].label}</span>
            <span className={`text-right font-mono tabular-nums ${tone(h.activity_effect)}`}>{pp(h.activity_effect)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function TerminalDesk() {
  const query = useQueryState();
  const funds = useFunds();
  const requested = query.get("fund")?.toUpperCase() ?? "DEMO";
  const directFund = useFund(requested);
  const fundList = [...(funds.data ?? [])];
  if (directFund.data && !fundList.some((item) => item.ticker === directFund.data!.ticker)) fundList.push(directFund.data);
  const fund = pickFund(fundList, requested);
  const snapshots = useSnapshots(fund || null);
  const snapList = snapshots.data ?? [];
  const range = pickRange(snapList, query.get("from"), query.get("to"));
  const changes = useChanges(fund || null, range?.from ?? null, range?.to ?? null);
  const data = changes.data;
  const changesKey = range ? `${fund}|${range.from}|${range.to}` : "";

  const [filter, setFilter] = useState("");
  const [chartTab, setChartTab] = useState("sectors");
  const [eventsTab, setEventsTab] = useState("events");
  const [bottomTab, setBottomTab] = useState("holdings");
  // A selection belongs to one comparison; changing fund or dates clears it.
  const [selection, setSelection] = useState<{ key: string; sel: Selection } | null>(null);
  const selected = selection?.key === changesKey ? selection.sel : null;

  const highlighted = useMemo(() => {
    if (!data || !selected) return new Set<string>();
    if (selected.kind === "holding") return new Set([selected.id]);
    return new Set(data.events.find((e) => e.id === selected.id)?.contributing_security_ids ?? []);
  }, [data, selected]);

  function chooseFund(ticker: string) {
    if (ticker !== fund) query.set({ fund: ticker, from: undefined, to: undefined });
  }
  function chooseRange(next: DateRange) {
    query.set({ fund, from: next.from, to: next.to });
  }
  function selectEvent(id: string | null) {
    setSelection(id ? { key: changesKey, sel: { kind: "event", id } } : null);
    if (id) setBottomTab("holdings");
  }
  function selectHolding(id: string) {
    const same = selected?.kind === "holding" && selected.id === id;
    setSelection(same ? null : { key: changesKey, sel: { kind: "holding", id } });
  }

  const q = filter.trim().toLowerCase();
  const visibleFunds = fundList.filter(
    (f) => !q || f.ticker.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
  );
  const tooFew = snapshots.data !== undefined && snapList.length < 2;

  let status: React.ReactNode = null;
  if (funds.error) status = <Notice tone="error">{funds.error}</Notice>;
  else if (snapshots.error) status = <Notice tone="error">{snapshots.error}</Notice>;
  else if (changes.error) status = <Notice tone="error">{changes.error}</Notice>;
  else if (tooFew)
    status = (
      <Notice>
        {fund} has {snapList.length} stored snapshot{snapList.length === 1 ? "" : "s"}. A comparison needs at
        least two: fetch and ingest the holdings file on another trading day.{" "}
        <Link href={`/fund?fund=${fund}`} className="text-accent hover:underline">
          See its holdings in the fund profile
        </Link>
        .
      </Notice>
    );
  else if (!data) status = <p className="p-4 text-sm text-muted">Loading comparison…</p>;

  return (
    <div className="grid gap-1 p-1 xl:h-full xl:grid-cols-[250px_minmax(0,1fr)_340px_300px] xl:grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Sidebar: funds, dates, caveats */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-panel xl:row-span-2">
        <div className="border-b border-line p-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search funds"
            aria-label="Filter funds"
            className="h-8 w-full rounded border border-line bg-panel-2 px-2.5 text-sm placeholder:text-faint focus:border-line-2 focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {funds.loading && <p className="p-2 text-sm text-muted">Loading funds…</p>}
          <FundSelector funds={visibleFunds} value={fund} onChange={chooseFund}>
            {range && snapshots.data && (
              <>
                <DateRangeSelector snapshots={snapList} value={range} onChange={chooseRange} />
                <SnapshotList snapshots={snapList} range={range} />
              </>
            )}
            {tooFew && <p className="text-xs text-faint">Needs two snapshots to compare.</p>}
          </FundSelector>
        </div>
        <div className="space-y-1.5 border-t border-line p-2">
          <button type="button" disabled={!data} onClick={() => data && downloadComparisonReport(data)} className="block w-full rounded border border-line bg-panel-2 py-1.5 text-center text-sm hover:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-40">Export comparison report</button>
          {data && (
            <details className="group rounded border border-line bg-panel-2 px-2 py-1.5 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <span>
                  Caveats <span className="font-mono text-xs text-faint">{data.caveats.length}</span>
                </span>
                <span className="text-faint transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="-mx-2 max-h-48 overflow-auto">
                <CaveatsBanner caveats={data.caveats} />
              </div>
            </details>
          )}
          {fund && (
            <Link
              href={`/fund?fund=${fund}`}
              className="block rounded border border-line bg-panel-2 py-1.5 text-center text-sm hover:bg-panel-3"
            >
              Fund profile
            </Link>
          )}
          {range && snapList.length > 2 && (
            <button
              type="button"
              onClick={() => query.set({ fund, from: undefined, to: undefined })}
              className="block w-full rounded border border-line bg-panel-2 py-1.5 text-center text-sm hover:bg-panel-3"
            >
              Widest range
            </button>
          )}
        </div>
      </section>

      {/* Chart */}
      <Panel
        className="min-h-[380px] xl:min-h-0"
        tabs={[
          { id: "sectors", label: "Sectors" },
          { id: "concentration", label: "Concentration" },
        ]}
        active={chartTab}
        onTab={setChartTab}
        right={
          data && (
            <span className="hidden font-mono md:inline">
              {data.fund} · {data.from.as_of_date} → {data.to.as_of_date} · ×{data.flow_factor.toFixed(3)} flow
            </span>
          )
        }
        bodyClassName="flex flex-col"
      >
        {status ? (
          <div className="p-3">{status}</div>
        ) : data && chartTab === "sectors" ? (
          <SectorChart sectors={data.sectors} />
        ) : data ? (
          <ConcentrationChart summary={data.summary} />
        ) : null}
      </Panel>

      {/* Events */}
      <Panel
        className="min-h-[300px] xl:min-h-0"
        tabs={[
          { id: "events", label: "Events", count: data?.events.length },
          { id: "changes", label: "Position changes" },
        ]}
        active={eventsTab}
        onTab={setEventsTab}
        footer={data && <GrossSplit data={data} />}
      >
        {data &&
          (eventsTab === "events" ? (
            <EventList
              events={data.events}
              selectedId={selected?.kind === "event" ? selected.id : null}
              onSelect={selectEvent}
            />
          ) : (
            <ChangedPositions data={data} onSelect={selectHolding} />
          ))}
      </Panel>

      {/* Inspector */}
      <Panel
        className="min-h-[300px] xl:row-span-2 xl:min-h-0"
        tabs={[{ id: "inspector", label: "Inspector" }]}
        active="inspector"
        right={
          selected && (
            <button type="button" onClick={() => setSelection(null)} className="hover:text-fg">
              Clear ×
            </button>
          )
        }
        footer={
          data && (
            <div className="space-y-1 p-2">
              {[data.from, data.to].map((m, i) => (
                <a
                  key={m.as_of_date}
                  href={holdingsUrl(data.fund, m.as_of_date)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded border border-line bg-panel-2 px-2.5 py-1.5 text-xs hover:bg-panel-3"
                >
                  <span>
                    <span className="label mr-2">{i === 0 ? "From" : "To"}</span>
                    {m.as_of_date}
                  </span>
                  <span className="font-mono text-faint">{m.content_hash.slice(0, 10)}… ↗</span>
                </a>
              ))}
            </div>
          )
        }
      >
        {data && <Inspector data={data} selection={selected} />}
      </Panel>

      {/* Bottom tabs */}
      <Panel
        className="min-h-[340px] xl:col-span-2 xl:min-h-0"
        tabs={[
          { id: "holdings", label: "Holdings", count: data?.holdings.length },
          { id: "sectors", label: "Sectors", count: data?.sectors.length },
          { id: "source", label: "Source" },
          { id: "caveats", label: "Caveats", count: data?.caveats.length },
        ]}
        active={bottomTab}
        onTab={setBottomTab}
        right={data && bottomTab === "holdings" && <span className="hidden md:inline">Click a row to inspect it</span>}
      >
        {data && bottomTab === "holdings" && (
          <HoldingsTable
            holdings={data.holdings}
            highlighted={highlighted}
            scrollKey={selected?.kind === "event" ? selected.id : null}
            onSelect={selectHolding}
          />
        )}
        {data && bottomTab === "sectors" && <SectorTable sectors={data.sectors} />}
        {data && bottomTab === "source" && (
          <SourceInfo fund={data.fund} from={data.from} to={data.to} configVersion={data.config_version} />
        )}
        {data && bottomTab === "caveats" && <CaveatsBanner caveats={data.caveats} />}
      </Panel>
    </div>
  );
}
