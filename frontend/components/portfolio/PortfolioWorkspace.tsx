"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, type Fund, type PortfolioAnalysis, type PortfolioInput } from "@/lib/api";
import SectorExposurePie from "@/components/SectorExposurePie";

type Saved = { id: string; key: string; name: string };
type DraftFund = { ticker: string; name: string; weight: string; snapshot_count?: number; latest_as_of_date?: string | null };
const EMPTY_DRAFT: DraftFund[] = [];
const STORAGE_KEY = "fundshift-portfolios-v1";
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function readSaved(): Saved[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && typeof item.key === "string") : [];
  } catch {
    return [];
  }
}

export default function PortfolioWorkspace() {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("My Portfolio");
  const [draftState, setDraftState] = useState<{ id: string; items: DraftFund[] }>({ id: "", items: EMPTY_DRAFT });
  const draft = draftState.id === selected ? draftState.items : EMPTY_DRAFT;
  function setDraft(update: DraftFund[] | ((items: DraftFund[]) => DraftFund[])) {
    setDraftState((previous) => {
      const current = previous.id === selected ? previous.items : EMPTY_DRAFT;
      return { id: selected, items: typeof update === "function" ? update(current) : update };
    });
  }
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Fund[]>([]);
  const [analysisState, setAnalysisState] = useState<{ id: string; data: PortfolioAnalysis } | null>(null);
  const analysis = analysisState?.id === selected ? analysisState.data : null;
  const [previewState, setPreviewState] = useState<{ signature: string; status: "loading" | "ready" | "error"; data?: PortfolioAnalysis; message?: string } | null>(null);
  const [holdingsOnly, setHoldingsOnly] = useState(false);
  const previewSequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const draftSummary = useMemo(() => {
    const weights = draft.map((fund) => Number(fund.weight));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const valid = draft.length > 0 && weights.every((weight) => Number.isFinite(weight) && weight > 0) && Math.abs(total - 100) <= 0.00001;
    const signature = JSON.stringify([selected, name, draft.map((fund) => [fund.ticker, fund.weight])]);
    return {
      total,
      signature,
      previewRequest: valid ? {
        id: selected || null,
        signature,
        body: { name: name.trim() || "Portfolio preview", funds: draft.map((fund, index) => ({ ticker: fund.ticker, weight: weights[index] / total })) } as PortfolioInput,
      } : null,
    };
  }, [draft, name, selected]);
  const matchingPreview = previewState?.signature === draftSummary.signature ? previewState : null;
  const preview = matchingPreview?.status === "ready" ? matchingPreview.data ?? null : null;
  const previewMessage = !draft.length
    ? "Add funds and assign weights totaling 100% to preview exposure."
    : !draftSummary.previewRequest
      ? `Assign positive weights totaling 100% to preview (currently ${draftSummary.total.toFixed(2)}%).`
      : matchingPreview?.status === "error"
        ? matchingPreview.message ?? "Could not calculate proposed exposure."
        : "Updating proposed exposure…";

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const local = readSaved();
      setSaved(local);
      const sharedId = new URLSearchParams(window.location.search).get("id");
      if (sharedId || local[0]) setSelected(sharedId || local[0].id);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    window.history.replaceState(null, "", `/portfolio?id=${encodeURIComponent(selected)}`);
    let active = true;
    Promise.all([api.portfolio(selected), api.portfolioAnalysis(selected)]).then(([portfolio, result]) => {
      if (!active) return;
      setName(portfolio.name);
      setAnalysisState({ id: selected, data: result });
      setError("");
      Promise.all(portfolio.funds.map(async (fund) => {
        const meta = await api.fund(fund.ticker).catch(() => null);
        return { ticker: fund.ticker, name: fund.name, weight: String(+(fund.weight * 100).toFixed(8)), snapshot_count: meta?.snapshot_count, latest_as_of_date: meta?.latest_as_of_date };
      })).then((draftFunds) => { if (active) setDraftState({ id: selected, items: draftFunds }); });
    }).catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    const sequence = ++previewSequence.current;
    const request = draftSummary.previewRequest;
    if (!request) return;
    const timer = setTimeout(() => {
      setPreviewState({ signature: request.signature, status: "loading" });
      api.previewPortfolio(request.id, request.body).then((result) => {
        if (sequence !== previewSequence.current) return;
        setPreviewState({ signature: request.signature, status: "ready", data: result });
      }).catch((reason: Error) => {
        if (sequence !== previewSequence.current) return;
        setPreviewState({ signature: request.signature, status: "error", message: reason.message });
      });
    }, 250);
    return () => { clearTimeout(timer); if (previewSequence.current === sequence) previewSequence.current += 1; };
  }, [draftSummary]);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.searchEtfs(term, controller.signal).then(setMatches).catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  function persist(next: Saved[]) {
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function addFund(fund: Fund) {
    if (!draft.some((item) => item.ticker === fund.ticker)) {
      setDraft((items) => [...items, { ticker: fund.ticker, name: fund.name, weight: items.length ? "0" : "100", snapshot_count: fund.snapshot_count, latest_as_of_date: fund.latest_as_of_date }]);
    }
    setQuery("");
    setMatches([]);
  }

  function input(): PortfolioInput {
    const weights = draft.map((fund) => Number(fund.weight));
    if (!name.trim()) throw new Error("Enter a portfolio name.");
    if (!draft.length) throw new Error("Add at least one ETF.");
    if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) throw new Error("Every fund needs a weight above zero.");
    if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.00001) throw new Error("Weights must add to 100%.");
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return { name: name.trim(), funds: draft.map((fund, index) => ({ ticker: fund.ticker, weight: weights[index] / total })) };
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = input();
      if (selected) {
        const key = saved.find((item) => item.id === selected)?.key;
        if (!key) throw new Error("The edit key for this portfolio is unavailable in this browser.");
        await api.updatePortfolio(selected, key, body);
        persist(saved.map((item) => item.id === selected ? { ...item, name: body.name } : item));
        setAnalysisState({ id: selected, data: await api.portfolioAnalysis(selected) });
      } else {
        const created = await api.createPortfolio(body);
        persist([...saved, { id: created.id, key: created.edit_key, name: created.name }]);
        setSelected(created.id);
        setAnalysisState({ id: created.id, data: await api.portfolioAnalysis(created.id) });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save portfolio.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const item = saved.find((entry) => entry.id === selected);
    if (!item || !window.confirm(`Delete ${item.name}?`)) return;
    setBusy(true);
    try {
      await api.deletePortfolio(item.id, item.key);
      persist(saved.filter((entry) => entry.id !== item.id));
      window.history.replaceState(null, "", "/portfolio");
      setSelected("");
      setName("My Portfolio");
      setDraft([]);
      setAnalysisState(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete portfolio.");
    } finally {
      setBusy(false);
    }
  }

  function fresh() {
    window.history.replaceState(null, "", "/portfolio");
    setSelected("");
    setName("My Portfolio");
    setDraft([]);
    setAnalysisState(null);
    setError("");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 text-fg sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest text-accent">Portfolio workspace</p><h1 className="text-2xl font-semibold">Your ETF portfolio</h1><p className="text-sm text-muted">Assign fund weights and see the latest available holdings across them.</p></div>
        <button type="button" onClick={fresh} className="rounded border border-line px-3 py-2 text-sm hover:bg-panel-2">New portfolio</button>
      </div>

      {saved.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Saved portfolios">{saved.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`rounded border px-3 py-1.5 text-sm ${selected === item.id ? "border-accent text-accent" : "border-line text-muted"}`}>{item.name}</button>)}</div>}

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-md border border-line bg-panel p-4">
          <label className="block text-xs uppercase tracking-wider text-muted">Portfolio name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-2 w-full rounded border border-line bg-canvas px-3 py-2 text-sm normal-case tracking-normal text-fg" /></label>
          <div className="relative"><label htmlFor="etf-search" className="text-xs uppercase tracking-wider text-muted">Add an ETF</label><input id="etf-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker or fund name" className="mt-2 w-full rounded border border-line bg-canvas px-3 py-2 text-sm text-fg" />{query && matches.length > 0 && <div className="absolute inset-x-0 top-full z-10 max-h-60 overflow-auto rounded border border-line bg-panel-2 shadow-xl">{matches.filter((fund) => !holdingsOnly || fund.snapshot_count > 0).map((fund) => <button type="button" key={fund.ticker} onClick={() => addFund(fund)} className="flex w-full justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-panel-3"><span><strong>{fund.ticker}</strong> {fund.name}</span><span className="shrink-0 text-right text-xs text-muted">{fund.snapshot_count >= 2 ? "Comparison ready" : fund.snapshot_count === 1 ? "1 snapshot" : "No holdings yet"}{fund.latest_as_of_date && <span className="block">latest {fund.latest_as_of_date}</span>}</span></button>)}</div>}
            <label className="mt-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={holdingsOnly} onChange={(event) => setHoldingsOnly(event.target.checked)} />Only show ETFs with stored holdings</label>
          </div>
          <div className="space-y-2">{draft.map((fund, index) => <div key={fund.ticker} className="flex items-center gap-2 rounded border border-line p-2"><div className="min-w-0 flex-1"><strong className="text-sm">{fund.ticker}</strong><p className="truncate text-xs text-muted">{fund.name}</p><p className={`mt-0.5 text-[10px] ${fund.snapshot_count === 0 ? "text-down" : "text-faint"}`}>{fund.snapshot_count === undefined ? "Checking holdings…" : fund.snapshot_count === 0 ? "No holdings · excluded from exposure" : `${fund.snapshot_count} snapshot${fund.snapshot_count === 1 ? "" : "s"}${fund.latest_as_of_date ? ` · latest ${fund.latest_as_of_date}` : ""}`}</p></div><label className="flex items-center gap-1 text-xs text-muted"><input aria-label={`${fund.ticker} weight percent`} type="number" min="0.0001" max="100" step="0.01" value={fund.weight} onChange={(event) => setDraft((items) => items.map((item, i) => i === index ? { ...item, weight: event.target.value } : item))} className="w-16 rounded border border-line bg-canvas px-1.5 py-1 text-right text-sm text-fg" />%</label><button type="button" aria-label={`Remove ${fund.ticker}`} onClick={() => setDraft((items) => items.filter((_, i) => i !== index))} className="px-1 text-muted hover:text-fg">×</button></div>)}</div>
          <p className="text-sm text-muted">Assigned: <span className="font-mono text-fg">{draft.reduce((sum, fund) => sum + (Number(fund.weight) || 0), 0).toFixed(2)}%</span></p>
          {draft.some((fund) => fund.snapshot_count !== undefined) && <p className="rounded border border-down/30 bg-down/5 p-2 text-xs text-muted">Weight with no stored holdings: <strong className="text-down">{draft.filter((fund) => fund.snapshot_count === 0).reduce((sum, fund) => sum + (Number(fund.weight) || 0), 0).toFixed(2)}%</strong>. These funds lower holdings coverage and add no measured exposures.</p>}
          {error && <p role="alert" className="text-sm text-down">{error}</p>}
          <div className="flex gap-2"><button type="button" disabled={busy || (!!selected && !saved.some((item) => item.id === selected))} onClick={save} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50">{busy ? "Saving…" : selected ? "Save changes" : "Create portfolio"}</button>{selected && saved.some((item) => item.id === selected) && <button type="button" disabled={busy} onClick={remove} className="rounded border border-line px-3 py-2 text-sm text-muted">Delete</button>}</div>
          <p className="text-xs text-faint">Saved portfolios and edit keys are kept in this browser. Keep the portfolio URL if you want a shareable read-only view.</p>
        </section>

        <div className="min-w-0 space-y-5">
          <section className="rounded-md border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Proposed portfolio preview</h2><p className="text-xs text-muted">Recalculates from the latest available holdings as you edit weights. Nothing is saved until you choose Save.</p></div><span className="rounded bg-panel-3 px-2 py-1 text-[11px] text-muted">Exposure &amp; concentration</span></div>
            {previewMessage && <p className="mt-3 text-sm text-muted" role="status">{previewMessage}</p>}
            {preview && <>
              <p className="mt-3 text-xs text-muted">Coverage {pct(preview.coverage_weight)} · newest snapshot {preview.newest_as_of_date || "unavailable"} · top holding {preview.top_exposures[0] ? `${preview.top_exposures[0].ticker || preview.top_exposures[0].name} ${pct(preview.top_exposures[0].weight)}` : "unavailable"}</p>
              {analysis && <p className="mt-1 text-xs text-muted">Compared with saved portfolio: top holdings and sector shares below update for the proposed weights.</p>}
              <p className="mt-3 rounded border border-line bg-panel-2 p-3 text-xs text-muted">Unknown sector: <strong className="text-fg">{pct(preview.sectors.find((row) => row.name.toLowerCase() === "unknown")?.weight ?? 0)}</strong> of portfolio weight · Cash: <strong className="text-fg">{pct(preview.asset_classes.filter((row) => row.name.toLowerCase().includes("cash")).reduce((sum, row) => sum + row.weight, 0))}</strong> · Other assets: <strong className="text-fg">{pct(preview.asset_classes.filter((row) => row.name.toLowerCase().includes("other")).reduce((sum, row) => sum + row.weight, 0))}</strong>. Unknown means issuer sector data or the security identifier could not be mapped to a recognized sector. Cash, derivatives, and other instruments retain the stored asset class; the app does not infer derivative status.</p>
            </>}
            <p className="mt-3 text-[11px] text-faint">This shows holdings exposure and concentration, not a forecast of volatility, drawdown, or future returns. Fund snapshots may have different dates.</p>
          </section>
          {(analysis || preview) && <div className="grid gap-3 xl:grid-cols-2">
            {analysis && <SectorExposurePie title={preview ? "Saved sector mix" : "Sector exposure"} rows={analysis.sectors} />}
            {preview && <SectorExposurePie title={analysis ? "Proposed sector mix" : "Sector exposure"} rows={preview.sectors} />}
          </div>}
          {analysis && preview && <div className="grid gap-3 xl:grid-cols-2"><ExposureTable title="Current top holdings" rows={analysis.top_exposures} /><ExposureTable title="Proposed top holdings" rows={preview.top_exposures} /></div>}
          {!analysis ? <section className="rounded-md border border-line bg-panel p-6 text-muted">Create or select a portfolio to see its latest fund data.</section> : <>
            <section className="rounded-md border border-line bg-panel p-4"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-lg font-semibold">{analysis.portfolio.name}</h2><p className="text-xs text-muted">Newest snapshot: {analysis.newest_as_of_date || "none"}</p></div><span className="text-sm text-muted">Holdings coverage <strong className="text-fg">{pct(analysis.coverage_weight)}</strong></span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{analysis.funds.map((fund) => <div key={fund.ticker} className="rounded border border-line p-3"><div className="flex justify-between"><Link className="font-semibold text-accent" href={`/fund?fund=${fund.ticker}`}>{fund.ticker}</Link><span className="font-mono text-sm">{pct(fund.weight)}</span></div><p className="truncate text-sm text-muted">{fund.name}</p><p className="mt-1 text-xs text-faint">{fund.as_of_date || "Holdings unavailable"}</p></div>)}</div></section>
            <div className="grid gap-5 xl:grid-cols-2"><ExposureTable title="Top holdings" rows={analysis.top_exposures} /><ExposureTable title="Shared holdings" rows={analysis.overlap} /></div>
            <div className="grid gap-5 xl:grid-cols-2"><Breakdown title="Sectors" rows={analysis.sectors} /><Breakdown title="Asset classes" rows={analysis.asset_classes} /></div>
            <p className="text-xs text-muted">{analysis.caveats.join(" ")}</p>
          </>}
        </div>
      </div>
    </div>
  );
}

function ExposureTable({ title, rows }: { title: string; rows: PortfolioAnalysis["top_exposures"] }) {
  return <section className="overflow-hidden rounded-md border border-line bg-panel"><h2 className="border-b border-line px-4 py-3 font-semibold">{title}</h2>{rows.length ? <div className="max-h-80 overflow-auto">{rows.map((row) => <div key={row.security_id} className="flex justify-between gap-3 border-b border-line px-4 py-2 text-sm"><div className="min-w-0"><p className="truncate">{row.ticker || row.name}</p><p className="truncate text-xs text-muted">{row.funds.join(", ")} · {row.asset_class} · {row.sector}</p></div><span className="shrink-0 font-mono">{pct(row.weight)}</span></div>)}</div> : <p className="p-4 text-sm text-muted">No available holdings.</p>}</section>;
}

function Breakdown({ title, rows }: { title: string; rows: PortfolioAnalysis["sectors"] }) {
  return <section className="rounded-md border border-line bg-panel p-4"><h2 className="mb-3 font-semibold">{title}</h2>{rows.length ? rows.map((row) => <div key={row.name} className="mb-3 text-sm"><div className="mb-1 flex justify-between gap-3"><span>{row.name}</span><span className="font-mono">{pct(row.weight)}</span></div><div className="h-1.5 rounded bg-panel-3"><div className="h-1.5 rounded bg-accent" style={{ width: `${Math.min(row.weight * 100, 100)}%` }} /></div></div>) : <p className="text-sm text-muted">No available holdings.</p>}</section>;
}
