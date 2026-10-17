"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api, type Changes, type Fund, type Snapshot } from "@/lib/api";

import CaveatsBanner from "./CaveatsBanner";
import DateRangeSelector, { type DateRange } from "./DateRangeSelector";
import EventList from "./EventList";
import FundSelector from "./FundSelector";
import HoldingsTable from "./HoldingsTable";
import SectorChart from "./SectorChart";
import SourceInfo from "./SourceInfo";
import SummaryCards from "./SummaryCards";

// A fetch result tagged with the request it answers, so stale responses are never shown.
type Loaded<T> = { key: string; data?: T; error?: string };

function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: React.ReactNode }) {
  const style =
    tone === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-zinc-200 bg-white text-zinc-600";
  return <div className={`rounded border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

export default function Dashboard() {
  const [funds, setFunds] = useState<Loaded<Fund[]> | null>(null);
  const [fund, setFund] = useState("");
  const [snapshots, setSnapshots] = useState<Loaded<Snapshot[]> | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [changes, setChanges] = useState<Loaded<Changes> | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  // Dates asked for in the URL (?fund=DEMO&from=...&to=...), applied once snapshots load.
  const requested = useRef<{ from?: string; to?: string }>({});

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams(window.location.search);
    requested.current = { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined };
    api.funds(ctrl.signal).then(
      (list) => {
        setFunds({ key: "funds", data: list });
        const wanted = params.get("fund")?.toUpperCase();
        const comparable = list.filter((f) => f.snapshot_count >= 2);
        const pick =
          list.find((f) => f.ticker === wanted) ??
          comparable.find((f) => f.ticker === "DEMO") ??
          comparable[0] ??
          list[0];
        if (pick) setFund(pick.ticker);
      },
      (err: Error) => {
        if (!ctrl.signal.aborted) setFunds({ key: "funds", error: err.message });
      },
    );
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!fund) return;
    const ctrl = new AbortController();
    api.snapshots(fund, ctrl.signal).then(
      (list) => {
        setSnapshots({ key: fund, data: list });
        const dates = list.map((s) => s.as_of_date);
        const want = requested.current;
        requested.current = {};
        if (dates.length < 2) return;
        // Default to the widest range: first snapshot to latest.
        const from = want.from && dates.slice(0, -1).includes(want.from) ? want.from : dates[0];
        const to = want.to && dates.includes(want.to) && want.to > from ? want.to : dates[dates.length - 1];
        setRange({ from, to });
      },
      (err: Error) => {
        if (!ctrl.signal.aborted) setSnapshots({ key: fund, error: err.message });
      },
    );
    return () => ctrl.abort();
  }, [fund]);

  const changesKey = fund && range ? `${fund}|${range.from}|${range.to}` : null;

  useEffect(() => {
    if (!fund || !range) return;
    const key = `${fund}|${range.from}|${range.to}`;
    const ctrl = new AbortController();
    api.changes(fund, range.from, range.to, ctrl.signal).then(
      (data) => setChanges({ key, data }),
      (err: Error) => {
        if (!ctrl.signal.aborted) setChanges({ key, error: err.message });
      },
    );
    window.history.replaceState(null, "", `?fund=${fund}&from=${range.from}&to=${range.to}`);
    return () => ctrl.abort();
  }, [fund, range]);

  const current = changes && changes.key === changesKey ? changes : null;
  const data = current?.data;
  const selected = data?.events.find((e) => e.id === selectedEvent) ?? null;
  const highlighted = useMemo(() => new Set(selected?.contributing_security_ids ?? []), [selected]);

  function chooseFund(ticker: string) {
    if (ticker === fund) return;
    setFund(ticker);
    setSnapshots(null);
    setRange(null);
    setSelectedEvent(null);
  }

  function chooseRange(next: DateRange) {
    setRange(next);
    setSelectedEvent(null);
  }

  const snapshotList = snapshots?.key === fund ? snapshots.data : undefined;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">FundShift</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            How an actively managed ETF&apos;s portfolio changed between two snapshots, split into price
            movement and portfolio activity (changes in share counts).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {funds?.data && funds.data.length > 0 && (
            <FundSelector funds={funds.data} value={fund} onChange={chooseFund} />
          )}
          {snapshotList && range && (
            <DateRangeSelector snapshots={snapshotList} value={range} onChange={chooseRange} />
          )}
        </div>
      </header>

      {!funds && <Notice>Loading funds…</Notice>}
      {funds?.error && <Notice tone="error">{funds.error}</Notice>}
      {funds?.data?.length === 0 && (
        <Notice>No funds yet. Run &quot;make ingest-sample&quot; and reload.</Notice>
      )}
      {snapshots?.error && <Notice tone="error">{snapshots.error}</Notice>}
      {snapshotList && snapshotList.length < 2 && (
        <Notice>
          {fund} has {snapshotList.length} stored snapshot{snapshotList.length === 1 ? "" : "s"}. A comparison
          needs at least two: fetch and ingest the holdings file on another trading day.
        </Notice>
      )}
      {changesKey && !current && <Notice>Loading comparison…</Notice>}
      {current?.error && <Notice tone="error">{current.error}</Notice>}

      {data && (
        <>
          <CaveatsBanner caveats={data.caveats} />
          <SummaryCards changes={data} />
          <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <SectorChart sectors={data.sectors} />
            <EventList events={data.events} selectedId={selectedEvent} onSelect={setSelectedEvent} />
          </div>
          <HoldingsTable holdings={data.holdings} highlighted={highlighted} scrollKey={selectedEvent} />
          <SourceInfo fund={data.fund} from={data.from} to={data.to} configVersion={data.config_version} />
        </>
      )}
    </main>
  );
}
