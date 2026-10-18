"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type Fund, type PortfolioAnalysis, type PortfolioInput } from "@/lib/api";

type Saved = { id: string; key: string; name: string };
type DraftFund = { ticker: string; name: string; weight: string };
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
  const [draft, setDraft] = useState<DraftFund[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Fund[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      setDraft(portfolio.funds.map((fund) => ({ ticker: fund.ticker, name: fund.name, weight: String(+(fund.weight * 100).toFixed(4)) })));
      setAnalysis(result);
      setError("");
    }).catch((reason: Error) => active && setError(reason.message));
    return () => { active = false; };
  }, [selected]);

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
      setDraft((items) => [...items, { ticker: fund.ticker, name: fund.name, weight: items.length ? "0" : "100" }]);
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
    return { name: name.trim(), funds: draft.map((fund, index) => ({ ticker: fund.ticker, weight: weights[index] / 100 })) };
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
        setAnalysis(await api.portfolioAnalysis(selected));
      } else {
        const created = await api.createPortfolio(body);
        persist([...saved, { id: created.id, key: created.edit_key, name: created.name }]);
        setSelected(created.id);
        setAnalysis(await api.portfolioAnalysis(created.id));
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
      setAnalysis(null);
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
    setAnalysis(null);
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
          <div className="relative"><label htmlFor="etf-search" className="text-xs uppercase tracking-wider text-muted">Add an ETF</label><input id="etf-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker or fund name" className="mt-2 w-full rounded border border-line bg-canvas px-3 py-2 text-sm text-fg" />{query && matches.length > 0 && <div className="absolute inset-x-0 top-full z-10 max-h-60 overflow-auto rounded border border-line bg-panel-2 shadow-xl">{matches.map((fund) => <button type="button" key={fund.ticker} onClick={() => addFund(fund)} className="flex w-full justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-panel-3"><span><strong>{fund.ticker}</strong> {fund.name}</span><span className="shrink-0 text-xs text-muted">{fund.snapshot_count ? "Holdings" : "No holdings yet"}</span></button>)}</div>}</div>
          <div className="space-y-2">{draft.map((fund, index) => <div key={fund.ticker} className="flex items-center gap-2 rounded border border-line p-2"><div className="min-w-0 flex-1"><strong className="text-sm">{fund.ticker}</strong><p className="truncate text-xs text-muted">{fund.name}</p></div><label className="flex items-center gap-1 text-xs text-muted"><input aria-label={`${fund.ticker} weight percent`} type="number" min="0.0001" max="100" step="0.01" value={fund.weight} onChange={(event) => setDraft((items) => items.map((item, i) => i === index ? { ...item, weight: event.target.value } : item))} className="w-16 rounded border border-line bg-canvas px-1.5 py-1 text-right text-sm text-fg" />%</label><button type="button" aria-label={`Remove ${fund.ticker}`} onClick={() => setDraft((items) => items.filter((_, i) => i !== index))} className="px-1 text-muted hover:text-fg">×</button></div>)}</div>
          <p className="text-sm text-muted">Assigned: <span className="font-mono text-fg">{draft.reduce((sum, fund) => sum + (Number(fund.weight) || 0), 0).toFixed(2)}%</span></p>
          {error && <p role="alert" className="text-sm text-down">{error}</p>}
          <div className="flex gap-2"><button type="button" disabled={busy || (!!selected && !saved.some((item) => item.id === selected))} onClick={save} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-50">{busy ? "Saving…" : selected ? "Save changes" : "Create portfolio"}</button>{selected && saved.some((item) => item.id === selected) && <button type="button" disabled={busy} onClick={remove} className="rounded border border-line px-3 py-2 text-sm text-muted">Delete</button>}</div>
          <p className="text-xs text-faint">Saved portfolios and edit keys are kept in this browser. Keep the portfolio URL if you want a shareable read-only view.</p>
        </section>

        <div className="min-w-0 space-y-5">
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
  return <section className="overflow-hidden rounded-md border border-line bg-panel"><h2 className="border-b border-line px-4 py-3 font-semibold">{title}</h2>{rows.length ? <div className="max-h-80 overflow-auto">{rows.map((row) => <div key={row.security_id} className="flex justify-between gap-3 border-b border-line px-4 py-2 text-sm"><div className="min-w-0"><p className="truncate">{row.ticker || row.name}</p><p className="truncate text-xs text-muted">{row.funds.join(", ")} · {row.sector}</p></div><span className="shrink-0 font-mono">{pct(row.weight)}</span></div>)}</div> : <p className="p-4 text-sm text-muted">No available holdings.</p>}</section>;
}

function Breakdown({ title, rows }: { title: string; rows: PortfolioAnalysis["sectors"] }) {
  return <section className="rounded-md border border-line bg-panel p-4"><h2 className="mb-3 font-semibold">{title}</h2>{rows.length ? rows.map((row) => <div key={row.name} className="mb-3 text-sm"><div className="mb-1 flex justify-between gap-3"><span>{row.name}</span><span className="font-mono">{pct(row.weight)}</span></div><div className="h-1.5 rounded bg-panel-3"><div className="h-1.5 rounded bg-accent" style={{ width: `${Math.min(row.weight * 100, 100)}%` }} /></div></div>) : <p className="text-sm text-muted">No available holdings.</p>}</section>;
}
