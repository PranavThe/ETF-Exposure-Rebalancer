"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  forgetLast,
  loadPortfolio,
  mixDistance,
  planner,
  rememberedPortfolio,
  savePortfolio,
  setSector,
  targetFrom,
  toMix,
  type ChatTurn,
  type CoveredEtf,
  type Holding,
  type Mix,
  type Plan,
  type PlanResult,
} from "@/lib/planner";

import ChatPanel from "./ChatPanel";
import ExposurePanel from "./ExposurePanel";
import HoldingsPanel from "./HoldingsPanel";
import MovesPanel from "./MovesPanel";
import PlanPanel, { type MoneyMode } from "./PlanPanel";
import StatusBar from "./StatusBar";
import { StatStrip, TickerTape } from "./Strips";
import TopBar from "./TopBar";
import { Toasts, type Toast } from "./ui";

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const EXAMPLE = [
  { ticker: "IVV", name: "iShares Core S&P 500 ETF", amount: 6000 },
  { ticker: "IYW", name: "iShares U.S. Technology ETF", amount: 3000 },
  { ticker: "ARKK", name: "ARK Innovation ETF", amount: 1000 },
];

type Saved = { id: string; key: string | null };
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function setUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("p", id);
  else url.searchParams.delete("p");
  window.history.replaceState(null, "", url);
}

/** The whole app: your ETFs, your sector mix against the mix you want, and the moves to get there. */
export default function PlannerApp() {
  const requested = useSearchParams().get("p");
  const [covered, setCovered] = useState<CoveredEtf[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [target, setTarget] = useState<Mix | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [money, setMoney] = useState<MoneyMode>("same");
  const [amount, setAmount] = useState(1000);
  const [maxNew, setMaxNew] = useState(2);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [activePlan, setActivePlan] = useState(0);
  const [turns, setTurns] = useState<(ChatTurn & { note?: string })[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const dirty = useRef(false);
  const savedId = useRef<string | null>(null);

  const cashChange = money === "add" ? amount : money === "out" ? -amount : 0;

  // Load the ETFs we have data for, and the saved portfolio (from ?p= or this browser).
  useEffect(() => {
    planner.covered().then(setCovered, () => setCovered([]));
  }, []);
  useEffect(() => {
    if (requested && requested === savedId.current) return; // we just saved it: already on screen
    const place = rememberedPortfolio(requested);
    if (!place) {
      Promise.resolve().then(() => setReady(true));
      return;
    }
    let active = true;
    loadPortfolio(place.id).then(
      (p) => {
        if (!active) return;
        setHoldings(p.holdings);
        setTarget(p.target);
        savedId.current = place.id;
        setSaved(place);
        setSaveState("saved");
        setUrl(place.id);
        setReady(true);
      },
      () => {
        if (!active) return;
        if (!requested) forgetLast();
        setReady(true);
      },
    );
    return () => {
      active = false;
    };
  }, [requested]);

  // Ask the planner whenever the inputs change.
  const request = useMemo(
    () => ({
      holdings: holdings.filter((h) => h.amount > 0).map((h) => ({ ticker: h.ticker, amount: h.amount })),
      target,
      cash_change: cashChange,
      max_new_funds: maxNew,
    }),
    [holdings, target, cashChange, maxNew],
  );
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPlanning(true);
      planner.plan(request, controller.signal).then(
        (r) => {
          if (controller.signal.aborted) return;
          setResult(r);
          setPlanError(null);
          setPlanning(false);
        },
        (err: Error) => {
          if (controller.signal.aborted) return;
          setPlanError(err.message);
          setPlanning(false);
        },
      );
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, ready]);

  // Save to the database a moment after the user stops editing.
  useEffect(() => {
    if (!ready || !dirty.current) return;
    if (!saved && holdings.length === 0) return;
    const timer = setTimeout(() => {
      dirty.current = false; // edits made while saving set it again
      setSaveState("saving");
      savePortfolio(saved, holdings, target).then(
        (place) => {
          savedId.current = place.id;
          setSaved(place);
          setUrl(place.id);
          setSaveState("saved");
        },
        () => {
          dirty.current = true;
          setSaveState("error");
        },
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [holdings, target, saved, ready]);

  function markDirty() {
    dirty.current = true;
    setSaveState((s) => (s === "saving" ? s : "pending"));
  }

  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      markDirty();
      setter(v);
    };
  }

  const current = useMemo(() => toMix(result?.current), [result]);
  const funds = useMemo(() => new Map((result?.funds ?? []).map((f) => [f.ticker, f])), [result]);
  const plans = target ? result?.plans ?? [] : [];
  const plan = plans[Math.min(activePlan, plans.length - 1)];
  const preview = useMemo(() => (plan ? toMix(plan.exposure) : null), [plan]);
  const hasHoldings = (result?.covered_total ?? 0) > 0;
  const distance = target && hasHoldings ? mixDistance(current, target) : null;
  const saveShown: SaveState = !saved && holdings.length === 0 ? "idle" : saveState;

  function toast(text: string, tone: Toast["tone"] = "ok") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }

  function highlight(tickers: string[]) {
    setFlash(new Set(tickers));
    setTimeout(() => setFlash(new Set()), 1000);
  }

  function addEtf(etf: { ticker: string; name: string }) {
    if (holdings.some((h) => h.ticker === etf.ticker)) {
      toast(`${etf.ticker} is already in your holdings`, "info");
      return;
    }
    markDirty();
    setHoldings((hs) => [...hs, { ...etf, amount: 1000 }]);
    highlight([etf.ticker]);
    toast(`Added ${etf.ticker} with $1,000. Type the amount you hold.`);
  }

  function loadExample() {
    markDirty();
    setHoldings(EXAMPLE.map((e) => ({ ...e })));
    toast("Example portfolio loaded");
  }

  function moveSlider(sector: string, value: number) {
    markDirty();
    const base = target ?? targetFrom(current);
    setTarget(setSector(base, sector, value, touched));
    setTouched((t) => new Set(t).add(sector));
  }

  function resetTarget() {
    markDirty();
    setTarget(null);
    setTouched(new Set());
  }

  function applyPlan(p: Plan) {
    markDirty();
    const after = new Map(p.moves.map((m) => [m.ticker, m]));
    const next = holdings
      .map((h) => (after.has(h.ticker) ? { ...h, amount: after.get(h.ticker)!.after } : h))
      .filter((h) => h.amount > 0 || !after.has(h.ticker));
    for (const m of p.moves) {
      if (!holdings.some((h) => h.ticker === m.ticker) && m.after > 0) next.push({ ticker: m.ticker, name: m.name, amount: m.after });
    }
    setHoldings(next);
    setMoney("same");
    setActivePlan(0);
    highlight(p.moves.map((m) => m.ticker));
    toast(`Applied ${p.moves.length} move${p.moves.length === 1 ? "" : "s"}. Your amounts are updated.`);
  }

  async function sendChat(message: string) {
    const history = turns.slice(-10).map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: message }]);
    setChatBusy(true);
    try {
      const reply = await planner.chat({
        message,
        history,
        current,
        target,
        total: result?.covered_total ?? 0,
      });
      if (reply.target) {
        markDirty();
        setTarget(reply.target);
        setTouched(new Set());
      }
      if (reply.cash_change) {
        setMoney(reply.cash_change > 0 ? "add" : "out");
        setAmount(Math.abs(reply.cash_change));
      }
      setConnected(reply.source === "claude");
      setTurns((t) => [
        ...t,
        { role: "assistant", content: reply.reply, note: reply.source === "rules" ? "simple reader (AI not connected)" : undefined },
      ]);
      if (reply.target) toast("Target updated", "info");
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", content: `Sorry, that didn’t go through. ${(err as Error).message}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied. Anyone with it can view this portfolio.");
    } catch {
      toast("Couldn’t copy. Copy the address bar instead.", "error");
    }
  }

  function startOver() {
    forgetLast();
    setUrl(null);
    dirty.current = false;
    savedId.current = null;
    setSaved(null);
    setSaveState("idle");
    setHoldings([]);
    setTarget(null);
    setTouched(new Set());
    setTurns([]);
    setMoney("same");
    toast("Cleared. Start a new portfolio.", "info");
  }

  const total = holdings.reduce((a, h) => a + h.amount, 0);
  const missing = (result?.funds ?? []).filter((f) => f.status === "missing");
  const largest = (result?.current ?? [])
    .filter((s) => s.sector !== "Unclassified")
    .reduce<{ sector: string; weight: number } | null>((best, s) => (!best || s.weight > best.weight ? s : best), null);
  const match = distance === null ? null : 1 - distance;
  const best = plans.length ? plans.reduce((a, b) => (b.distance < a.distance ? b : a)) : null;
  const dates = (result?.funds ?? []).map((f) => f.as_of_date).filter((d): d is string => Boolean(d)).sort();
  const asOf = dates.length ? (dates[0] === dates[dates.length - 1] ? shortDate(dates[0]) : `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`) : null;
  const held = useMemo(() => new Set(holdings.map((h) => h.ticker)), [holdings]);

  return (
    <div className="app-arcs flex h-dvh flex-col bg-canvas">
      <TopBar
        covered={covered}
        held={held}
        onPick={addEtf}
        focusKey={focusKey}
        save={saveShown}
        owner={Boolean(saved?.key)}
        canShare={Boolean(saved)}
        onShare={copyLink}
        onReset={holdings.length > 0 || saved ? startOver : null}
      />
      <TickerTape etfs={covered} onPick={addEtf} />
      <main className="min-h-0 flex-1 overflow-auto lg:overflow-hidden">
        <div className="flex flex-col gap-2 p-2 lg:h-full">
          <div className="animate-fade-up">
            <StatStrip
              total={total}
              covered={result?.covered_total ?? 0}
              etfCount={holdings.length}
              missingCount={missing.length}
              largest={largest}
              match={match}
              bestMatch={best ? 1 - best.distance : null}
              bestMoved={best ? best.moves.filter((m) => m.action === "reduce" || m.action === "remove").reduce((a, m) => a + m.amount, 0) : null}
              asOf={asOf}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[272px_minmax(0,1fr)_340px] 2xl:grid-cols-[320px_minmax(0,1fr)_400px]">
            <div className="animate-fade-up lg:min-h-0" style={{ animationDelay: "60ms" }}>
              <HoldingsPanel
                holdings={holdings}
                funds={funds}
                covered={covered}
                flash={flash}
                onAmount={(ticker, v) => edit(setHoldings)(holdings.map((h) => (h.ticker === ticker ? { ...h, amount: v } : h)))}
                onRemove={(ticker) => edit(setHoldings)(holdings.filter((h) => h.ticker !== ticker))}
                onAdd={addEtf}
                onExample={loadExample}
                onFocusSearch={() => setFocusKey((k) => k + 1)}
              />
            </div>
            <div className="flex animate-fade-up flex-col gap-2 lg:min-h-0" style={{ animationDelay: "120ms" }}>
              <ExposurePanel
                current={current}
                target={target}
                preview={preview}
                match={match}
                funds={result?.funds ?? []}
                hasHoldings={hasHoldings}
                onSector={moveSlider}
                onReset={resetTarget}
              />
              <MovesPanel plans={plans} active={activePlan} onActive={setActivePlan} hasTarget={target !== null} loading={planning} error={planError} />
            </div>
            <div className="flex animate-fade-up flex-col gap-2 lg:min-h-0" style={{ animationDelay: "180ms" }}>
              <PlanPanel
                plans={plans}
                active={activePlan}
                onActive={setActivePlan}
                match={match}
                total={result?.covered_total ?? total}
                money={money}
                amount={amount}
                maxNew={maxNew}
                onMoney={setMoney}
                onAmount={setAmount}
                onMaxNew={setMaxNew}
                onApply={applyPlan}
                hasTarget={target !== null}
              />
              <ChatPanel turns={turns} busy={chatBusy} onSend={sendChat} connected={connected} />
            </div>
          </div>
        </div>
      </main>
      <StatusBar etfsWithData={covered.filter((c) => !c.sample).length} />
      <Toasts toasts={toasts} />
    </div>
  );
}
