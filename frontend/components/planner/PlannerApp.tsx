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
import HoldingsPanel from "./HoldingsPanel";
import MixPanel from "./MixPanel";
import PlansPanel, { type MoneyMode } from "./PlansPanel";

const EXAMPLE = [
  { ticker: "IVV", amount: 6000 },
  { ticker: "IYW", amount: 3000 },
  { ticker: "ARKK", amount: 1000 },
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
  const [copied, setCopied] = useState(false);
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

  function addEtf(etf: { ticker: string; name: string }) {
    markDirty();
    setHoldings((hs) => (hs.some((h) => h.ticker === etf.ticker) ? hs : [...hs, { ...etf, amount: 1000 }]));
  }

  function loadExample() {
    const known = new Set(covered.map((c) => c.ticker));
    const pick = EXAMPLE.filter((e) => known.has(e.ticker));
    const chosen = pick.length ? pick : covered.filter((c) => !c.sample).slice(0, 3).map((c, i) => ({ ticker: c.ticker, amount: [6000, 3000, 1000][i] }));
    markDirty();
    setHoldings(chosen.map((e) => ({ ...e, name: covered.find((c) => c.ticker === e.ticker)?.name ?? e.ticker })));
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
      setTurns((t) => [
        ...t,
        { role: "assistant", content: reply.reply, note: reply.source === "rules" ? "simple reader (AI not connected)" : undefined },
      ]);
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", content: `Sorry, that didn’t go through. ${(err as Error).message}` }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
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
  }

  return (
    <div className="flex min-h-full flex-col gap-2 p-2 lg:h-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              saveShown === "saved" ? "bg-up" : saveShown === "saving" || saveShown === "pending" ? "bg-activity" : saveShown === "error" ? "bg-down" : "bg-faint"
            }`}
          />
          {saveShown === "saved"
            ? saved?.key
              ? "Saved. Only this browser can edit it."
              : "Viewing a shared portfolio. Changes save as your own copy."
            : saveShown === "saving" || saveShown === "pending"
              ? "Saving…"
              : saveShown === "error"
                ? "Couldn’t save. Your changes are still here."
                : "Add an ETF and your portfolio saves automatically."}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {saved && (
            <button type="button" onClick={copyLink} className="rounded border border-line px-2 py-0.5 hover:text-fg">
              {copied ? "Link copied" : "Copy link"}
            </button>
          )}
          {(holdings.length > 0 || saved) && (
            <button type="button" onClick={startOver} className="rounded border border-line px-2 py-0.5 hover:text-fg">
              Start over
            </button>
          )}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        <HoldingsPanel
          holdings={holdings}
          funds={funds}
          covered={covered}
          onAmount={(ticker, v) => edit(setHoldings)(holdings.map((h) => (h.ticker === ticker ? { ...h, amount: v } : h)))}
          onRemove={(ticker) => edit(setHoldings)(holdings.filter((h) => h.ticker !== ticker))}
          onAdd={addEtf}
          onExample={loadExample}
        />
        <MixPanel
          current={current}
          target={target}
          preview={preview}
          distance={distance}
          funds={result?.funds ?? []}
          hasHoldings={hasHoldings}
          onSector={moveSlider}
          onReset={resetTarget}
        />
        <div className="flex min-h-0 flex-col gap-2">
          <PlansPanel
            plans={plans}
            active={activePlan}
            onActive={setActivePlan}
            hasTarget={target !== null}
            hasHoldings={hasHoldings}
            beforeDistance={distance}
            loading={planning}
            error={planError}
            money={money}
            amount={amount}
            maxNew={maxNew}
            onMoney={setMoney}
            onAmount={setAmount}
            onMaxNew={setMaxNew}
            onApply={applyPlan}
          />
          <ChatPanel turns={turns} busy={chatBusy} onSend={sendChat} />
        </div>
      </div>
    </div>
  );
}
