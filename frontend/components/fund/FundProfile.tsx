"use client";

import { useMemo, useRef, useState } from "react";

import { api, type SimulationResult } from "@/lib/api";
import { pct, pp } from "@/lib/format";
import { pickFund, rangeOf, useChanges, useFund, useFunds, useHoldings, useQueryState, useSnapshots } from "@/lib/hooks";

import SectorExposurePie from "../SectorExposurePie";
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
  const requested = query.get("fund")?.toUpperCase() ?? null;
  const direct = useFund(requested);
  const fundList = [...(funds.data ?? [])];
  if (direct.data && !fundList.some((item) => item.ticker === direct.data!.ticker)) fundList.push(direct.data);
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
  const equityRows = useMemo(() => (dateHoldings.data?.holdings ?? []).filter((row) => row.asset_class.toLowerCase() === "equity" && row.shares > 0), [dateHoldings.data]);
  const scenarioKey = `${fund ?? ""}|${date ?? ""}`;
  const [targetState, setTargetState] = useState<{ key: string; values: Record<string, string> }>({ key: "", values: {} });
  const defaultTargetWeights = useMemo(() => {
    const positiveTotal = equityRows.reduce((sum, row) => sum + Math.max(0, row.market_value), 0);
    const rounded = equityRows.map((row) => ({
      security_id: row.security_id,
      weight: Math.floor((positiveTotal ? Math.max(0, row.market_value) / positiveTotal : 1 / equityRows.length) * 100 * 1_000_000) / 1_000_000,
    }));
    const assignedBeforeLast = rounded.slice(0, -1).reduce((sum, row) => sum + row.weight, 0);
    return Object.fromEntries(rounded.map((row, index) => [
      row.security_id,
      (index === rounded.length - 1 ? 100 - assignedBeforeLast : row.weight).toFixed(6),
    ]));
  }, [equityRows]);
  const targetWeights = targetState.key === scenarioKey ? targetState.values : defaultTargetWeights;
  const [simulationState, setSimulationState] = useState<{ key: string; result: SimulationResult } | null>(null);
  const simulation = simulationState?.key === scenarioKey ? simulationState.result : null;
  const [simulationErrorState, setSimulationErrorState] = useState<{ key: string; message: string } | null>(null);
  const simulationError = simulationErrorState?.key === scenarioKey ? simulationErrorState.message : "";
  const [simulatingKey, setSimulatingKey] = useState<string | null>(null);
  const simulating = simulatingKey === scenarioKey;
  const simulationSequence = useRef(0);
  const sectorRowsSource = equityRows.filter((row) => row.market_value > 0);
  const equityTotal = sectorRowsSource.reduce((sum, row) => sum + row.market_value, 0);
  const sectors = new Map<string, number>();
  for (const row of sectorRowsSource) sectors.set(row.sector, (sectors.get(row.sector) ?? 0) + row.market_value / (equityTotal || 1));
  const sectorRows = [...sectors].map(([name, weight]) => ({ name, weight }));
  const totalValue = (dateHoldings.data?.holdings ?? []).reduce((sum, row) => sum + Math.max(0, row.market_value), 0);
  const cashValue = (dateHoldings.data?.holdings ?? []).filter((row) => row.asset_class.toLowerCase() === "cash").reduce((sum, row) => sum + Math.max(0, row.market_value), 0);
  const otherValue = (dateHoldings.data?.holdings ?? []).filter((row) => row.asset_class.toLowerCase() !== "cash" && row.asset_class.toLowerCase() !== "equity").reduce((sum, row) => sum + Math.max(0, row.market_value), 0);

  async function runSimulation() {
    if (!fund || !date || !equityRows.length) return;
    const values = equityRows.map((row) => Number(targetWeights[row.security_id]));
    const sum = values.reduce((total, value) => total + value, 0);
    if (values.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(sum - 100) > 0.01) {
      setSimulationErrorState({ key: scenarioKey, message: `Equity weights must add to 100% (currently ${sum.toFixed(2)}%).` });
      return;
    }
    const sequence = ++simulationSequence.current;
    setSimulatingKey(scenarioKey);
    setSimulationErrorState(null);
    try {
      const result = await api.simulate(fund, date, { target_weights: Object.fromEntries(equityRows.map((row) => [row.security_id, Number(targetWeights[row.security_id]) / sum])) });
      if (sequence === simulationSequence.current) setSimulationState({ key: scenarioKey, result });
    } catch (reason) {
      if (sequence === simulationSequence.current) setSimulationErrorState({ key: scenarioKey, message: reason instanceof Error ? reason.message : "Could not calculate the scenario." });
    } finally {
      if (sequence === simulationSequence.current) setSimulatingKey(null);
    }
  }

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
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 pt-5 pb-12 md:px-6 md:pt-6">
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

            {dateHoldings.data && <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-3">
                <SectorExposurePie rows={sectorRows} title={`Sector exposure · ${date}`} description="Share of equity holdings by sector." />
                <p className="rounded border border-line bg-panel p-3 text-xs text-muted">Unknown sector: <strong className="text-fg">{pct(sectorRows.find((row) => row.name.toLowerCase() === "unknown")?.weight ?? 0)}</strong> of equity · Cash: <strong className="text-fg">{pct(totalValue ? cashValue / totalValue : 0)}</strong> · Other assets: <strong className="text-fg">{pct(totalValue ? otherValue / totalValue : 0)}</strong> of total holdings value. Unknown means a holding could not be assigned to a recognized sector.</p>
              </div>
              <section className="rounded-md border border-line bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">Simulate position weights</h2><p className="mt-1 text-xs text-muted">Change equity weights for this snapshot; scenario weights must total 100%.</p></div><span className="rounded bg-panel-3 px-2 py-1 text-[11px] text-muted">Concentration &amp; sector exposure</span></div>
                {equityRows.length ? <>
                  <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">{equityRows.map((row) => <label key={row.security_id} className="flex items-center gap-3 rounded border border-line/70 px-2 py-1.5 text-sm"><span className="min-w-0 flex-1 truncate">{row.ticker || row.name}<span className="ml-1 text-xs text-faint">{row.sector}</span></span><input aria-label={`${row.ticker || row.name} scenario weight percent`} type="number" min="0" max="100" step="0.1" value={targetWeights[row.security_id] ?? "0"} onChange={(event) => { setTargetState((current) => ({ key: scenarioKey, values: { ...(current.key === scenarioKey ? current.values : defaultTargetWeights), [row.security_id]: event.target.value } })); simulationSequence.current += 1; setSimulationState(null); setSimulationErrorState(null); setSimulatingKey(null); }} className="w-20 rounded border border-line bg-canvas px-2 py-1 text-right font-mono text-xs" /><span className="text-xs text-faint">%</span></label>)}</div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted">Proposed equity total <strong className="font-mono text-fg">{equityRows.reduce((sum, row) => sum + (Number(targetWeights[row.security_id]) || 0), 0).toFixed(2)}%</strong></span><button type="button" onClick={runSimulation} disabled={simulating} className="rounded bg-accent px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-50">{simulating ? "Calculating…" : "Calculate risk profile"}</button></div>
                </> : <p className="mt-3 text-sm text-muted">No positive equity positions are available to simulate for this snapshot.</p>}
                {simulationError && <p role="alert" className="mt-2 text-sm text-down">{simulationError}</p>}
                {simulation && <div className="mt-4 border-t border-line pt-3"><p className="text-xs text-muted">Scenario for {simulation.as_of_date} · top {simulation.top_n} positions · equity only</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Top holdings", simulation.current.top_n_share, simulation.scenario.top_n_share], ["HHI", simulation.current.hhi, simulation.scenario.hhi], ["Largest holding", simulation.current.largest_holding_weight, simulation.scenario.largest_holding_weight], ["Largest sector", simulation.current.largest_sector_weight, simulation.scenario.largest_sector_weight]].map(([label, before, after]) => <div key={String(label)} className="rounded border border-line p-2"><span className="block text-[10px] text-muted">{label}</span><strong className="block font-mono text-xs">{label === "HHI" ? Number(before).toFixed(4) : pct(Number(before))} → {label === "HHI" ? Number(after).toFixed(4) : pct(Number(after))}</strong></div>)}</div><div className="mt-3"><p className="mb-1 text-xs font-semibold">Sector changes</p>{simulation.sectors.map((row) => <div key={row.sector} className="flex justify-between border-b border-line/60 py-1 text-xs"><span>{row.sector}</span><span className="font-mono">{pct(row.weight_current)} → {pct(row.weight_target)} <span className="text-muted">({pp(row.weight_change)})</span></span></div>)}</div><p className="mt-2 text-[11px] text-faint">{simulation.caveats.join(" ")}</p></div>}
              </section>
            </div>}

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
