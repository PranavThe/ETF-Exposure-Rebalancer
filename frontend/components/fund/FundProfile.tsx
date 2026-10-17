"use client";

import { pickFund, rangeOf, useChanges, useFunds, useHoldings, useQueryState, useSnapshots } from "@/lib/hooks";

import Notice from "../ui/Notice";
import CalendarPanel from "./CalendarPanel";
import HoldingsSection from "./HoldingsSection";
import { ArcLines, Segmented } from "./kit";
import MetricsPanel from "./MetricsPanel";
import SourcesPanel from "./SourcesPanel";
import StatStrip from "./StatStrip";

/** The fund profile (?fund=&date=&from=&to=): identity, metrics, snapshot calendar, sources, holdings. */
export default function FundProfile() {
  const query = useQueryState();
  const funds = useFunds();
  const fundList = funds.data ?? [];
  const fund = pickFund(fundList, query.get("fund"));
  const meta = fundList.find((f) => f.ticker === fund);

  const snapshots = useSnapshots(fund || null);
  const snapList = snapshots.data;
  const dates = (snapList ?? []).map((s) => s.as_of_date);
  const latest = dates.at(-1) ?? null;
  const valid = (d?: string) => (d && dates.includes(d) ? d : undefined);
  const date = valid(query.get("date")) ?? latest;
  const from = valid(query.get("from"));
  const requestedTo = valid(query.get("to"));
  const to = from && requestedTo && requestedTo > from ? requestedTo : undefined;

  const wide = snapList ? rangeOf(snapList, "full") : null;
  const changes = useChanges(fund || null, wide?.from ?? null, wide?.to ?? null);
  const latestHoldings = useHoldings(fund || null, latest);
  const dateHoldings = useHoldings(fund || null, date);

  function chooseFund(ticker: string) {
    if (ticker !== fund) query.set({ fund: ticker, date: undefined, from: undefined, to: undefined });
  }

  function pickDay(day: string) {
    let nextFrom = from;
    let nextTo = to;
    if (!nextFrom || nextTo) {
      nextFrom = day;
      nextTo = undefined;
    } else if (day === nextFrom) {
      nextFrom = undefined;
    } else if (day < nextFrom) {
      nextTo = nextFrom;
      nextFrom = day;
    } else {
      nextTo = day;
    }
    query.set({ fund, date: day, from: nextFrom, to: nextTo });
  }

  const error = funds.error ?? snapshots.error;

  return (
    <div className="relative isolate min-h-full">
      <ArcLines />
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Fund profile</h1>
          {fundList.length > 0 && (
            <Segmented
              label="Fund"
              options={fundList.map((f) => ({
                value: f.ticker,
                label: f.ticker,
                title: `${f.name} · ${f.snapshot_count} snapshot${f.snapshot_count === 1 ? "" : "s"}`,
              }))}
              value={fund}
              onChange={chooseFund}
            />
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {funds.loading && <p className="text-sm text-muted">Loading funds…</p>}
        {funds.data && fundList.length === 0 && (
          <Notice>No funds are stored yet. Ingest a holdings file to create one.</Notice>
        )}

        {meta && (
          <>
            <StatStrip fund={meta} snapshots={snapList} latestHoldings={latestHoldings.data} changes={changes.data} />

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)_minmax(0,0.95fr)]">
              <div className="flex min-w-0 flex-col md:order-2 lg:order-none [&>section]:flex-1">
                <MetricsPanel
                  changes={changes.data}
                  holdings={latestHoldings.data}
                  snapshotCount={snapList?.length}
                  error={changes.error ?? latestHoldings.error}
                />
              </div>
              <div className="flex min-w-0 flex-col md:order-1 md:col-span-2 lg:order-none lg:col-span-1 [&>section]:flex-1">
                {snapList ? (
                  <CalendarPanel
                    key={fund}
                    fund={fund}
                    snapshots={snapList}
                    focus={date}
                    from={from}
                    to={to}
                    onPick={pickDay}
                    onClear={() => query.set({ fund, from: undefined, to: undefined })}
                  />
                ) : (
                  <section className="min-h-[360px] animate-pulse rounded-md border border-line bg-panel" aria-busy />
                )}
              </div>
              <div className="flex min-w-0 flex-col md:order-3 lg:order-none [&>section]:flex-1">
                <SourcesPanel fund={fund} snapshots={snapList} />
              </div>
            </div>

            {snapList && (
              <div className="pt-3">
                <HoldingsSection
                  fund={fund}
                  snapshots={snapList}
                  date={date}
                  holdings={dateHoldings.data}
                  error={dateHoldings.error}
                  onDate={(d) => query.set({ fund, date: d })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
