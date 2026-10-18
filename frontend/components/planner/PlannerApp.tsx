"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type ProviderHoldingChanges, type ProviderPrice } from "@/lib/api";

import {
  createPortfolio,
  loadPortfolio,
  mixDistance,
  planner,
  persistPortfolioTabs,
  rememberedPortfolio,
  renamePortfolio,
  restorePortfolioTabs,
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
  type PortfolioTab,
  type SavedPortfolio,
} from "@/lib/planner";

import HoldingsSection from "./HoldingsSection";
import MixSection from "./MixSection";
import MovesSection from "./MovesSection";
import PortfolioTabs from "./PortfolioTabs";
import ScytheSection from "./ScytheSection";
import StatusBar from "./StatusBar";
import TopBar from "./TopBar";
import { Toasts, type Toast } from "./ui";

const EXAMPLE = [
  { ticker: "IVV", name: "iShares Core S&P 500 ETF", amount: 6000 },
  { ticker: "IYW", name: "iShares U.S. Technology ETF", amount: 3000 },
  { ticker: "ARKK", name: "ARK Innovation ETF", amount: 1000 },
];

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
  const [initialRequested] = useState(requested);
  const [covered, setCovered] = useState<CoveredEtf[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [target, setTarget] = useState<Mix | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [maxNew, setMaxNew] = useState(2);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [activePlan, setActivePlan] = useState(0);
  const [turns, setTurns] = useState<(ChatTurn & { note?: string })[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<SavedPortfolio | null>(null);
  const [portfolioName, setPortfolioName] = useState("My ETFs");
  const [tabs, setTabs] = useState<PortfolioTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabsReady, setTabsReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [focusKey, setFocusKey] = useState(0);
  const [planRefresh, setPlanRefresh] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [providerData, setProviderData] = useState<Map<string, ProviderHoldingChanges>>(() => new Map());
  const [prices, setPrices] = useState<Map<string, ProviderPrice>>(() => new Map());
  const dirty = useRef(false);
  const savedId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef<Promise<void> | null>(null);
  const chatController = useRef<AbortController | null>(null);


  // Restore this browser's open tabs and load its active portfolio on startup.
  useEffect(() => {
    planner.covered().then(setCovered, () => setCovered([]));
  }, []);
  useEffect(() => {
    const restored = restorePortfolioTabs(initialRequested);
    setTabs(restored.tabs);
    setActiveTabId(restored.activeId);
    setTabsReady(true);
    if (!restored.activeId) {
      setReady(true);
      return;
    }
    const place = rememberedPortfolio(restored.activeId) ?? { id: restored.activeId, key: null };
    let active = true;
    loadPortfolio(place.id).then(
      (p) => {
        if (!active) return;
        setHoldings(p.holdings);
        setTarget(p.target);
        setPortfolioName(p.name);
        savedId.current = place.id;
        setSaved(place);
        setTabs((current) => current.map((tab) => tab.id === place.id
          ? { ...tab, name: p.name, key: place.key }
          : tab));
        setSaveState("saved");
        setUrl(place.id);
        setReady(true);
      },
      () => {
        if (!active) return;
        toast("Couldn’t open that saved portfolio. The link may be wrong or deleted.", "error");
        setReady(true);
      },
    );
    return () => {
      active = false;
    };
  }, [initialRequested]);

  useEffect(() => {
    if (tabsReady) persistPortfolioTabs(tabs, activeTabId);
  }, [tabs, activeTabId, tabsReady]);

  // Ask the planner whenever the inputs change.
  const request = useMemo(
    () => ({
      holdings: holdings.filter((h) => h.amount > 0).map((h) => ({ ticker: h.ticker, amount: h.amount })),
      target,
      cash_change: 0, // plans always use the money already in the ETFs
      max_new_funds: maxNew,
    }),
    [holdings, target, maxNew],
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
  }, [request, ready, planRefresh]);

  // For ETFs whose mix comes from TickerInside, fetch their top holdings and latest IEX prices.
  const providerTickers = useMemo(() => {
    const fromProvider = new Set((result?.funds ?? []).filter((f) => f.source_provider === "tickerinside").map((f) => f.ticker));
    return holdings.map((h) => h.ticker).filter((t) => fromProvider.has(t)).join(",");
  }, [holdings, result]);
  useEffect(() => {
    if (!providerTickers) return;
    const controller = new AbortController();
    Promise.all(providerTickers.split(",").map((t) => api.providerHoldingChanges(t, controller.signal).catch(() => null))).then(
      async (rows) => {
        if (controller.signal.aborted) return;
        setProviderData(new Map(rows.filter((r): r is ProviderHoldingChanges => r !== null).map((r) => [r.fund, r])));
        const symbols = [...new Set(rows.flatMap((r) => r?.holdings.slice(0, 5).map((h) => h.ticker) ?? []))];
        if (symbols.length === 0) return;
        const response = await api.providerPrices(symbols, controller.signal).catch(() => null);
        if (!controller.signal.aborted && response) setPrices(new Map(response.prices.map((p) => [p.ticker, p])));
      },
    );
    return () => controller.abort();
  }, [providerTickers]);

  const persistCurrent = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (saveInFlight.current) await saveInFlight.current;
    if (!dirty.current) return;
    if (!saved && holdings.length === 0) {
      dirty.current = false;
      return;
    }

    dirty.current = false;
    setSaveState("saving");
    const priorId = saved?.id ?? null;
    const pending = savePortfolio(saved, holdings, target, portfolioName).then(({ place, addedFunds }) => {
      savedId.current = place.id;
      setSaved(place);
      setPortfolioName(portfolioName);
      setActiveTabId(place.id);
      setUrl(place.id);
      setTabs((current) => {
        const index = priorId ? current.findIndex((tab) => tab.id === priorId) : -1;
        if (index >= 0) {
          return current.map((tab, i) => i === index ? { ...tab, id: place.id, name: portfolioName, key: place.key } : tab);
        }
        const existing = current.find((tab) => tab.id === place.id);
        return existing
          ? current.map((tab) => tab.id === place.id ? { ...tab, name: portfolioName, key: place.key } : tab)
          : [...current, { id: place.id, name: portfolioName, key: place.key }];
      });
      setSaveState("saved");
      if (addedFunds) setPlanRefresh((version) => version + 1);
    }).catch((error: unknown) => {
      dirty.current = true;
      setSaveState("error");
      throw error;
    });
    saveInFlight.current = pending;
    try {
      await pending;
    } finally {
      if (saveInFlight.current === pending) saveInFlight.current = null;
    }
  }, [saved, holdings, target, portfolioName]);

  // Save automatically after edits, and synchronously before changing tabs.
  useEffect(() => {
    if (!ready || !dirty.current) return;
    if (!saved && holdings.length === 0) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persistCurrent().catch(() => undefined);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [holdings, target, saved, portfolioName, ready, persistCurrent]);

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
  const hasHoldings = (result?.covered_total ?? 0) > 0;
  const distance = target && hasHoldings ? mixDistance(current, target) : null;
  const saveShown: SaveState = !saved && holdings.length === 0 ? "idle" : saveState;

  function toast(text: string, tone: Toast["tone"] = "ok") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 2600);
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
    setActivePlan(0);
    highlight(p.moves.map((m) => m.ticker));
    toast(`Applied ${p.moves.length} move${p.moves.length === 1 ? "" : "s"}. Your amounts are updated.`);
  }

  async function sendChat(message: string) {
    const controller = new AbortController();
    chatController.current = controller;
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
      }, controller.signal);
      if (controller.signal.aborted) return;
      if (reply.target) {
        markDirty();
        setTarget(reply.target);
        setTouched(new Set());
      }
      setConnected(reply.source === "gemini");
      setTurns((t) => [
        ...t,
        { role: "assistant", content: reply.reply, note: reply.source === "rules" ? "simple reader (AI not connected)" : undefined },
      ]);
      if (reply.target) toast("Target updated", "info");
    } catch (err) {
      if (controller.signal.aborted) return;
      setTurns((t) => [...t, { role: "assistant", content: `Sorry, that didn’t go through. ${(err as Error).message}` }]);
    } finally {
      if (chatController.current === controller) {
        chatController.current = null;
        setChatBusy(false);
      }
    }
  }

  function cancelPendingChat() {
    chatController.current?.abort();
    chatController.current = null;
    setChatBusy(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied. Anyone with it can view this portfolio.");
    } catch {
      toast("Couldn’t copy. Copy the address bar instead.", "error");
    }
  }

  function showLoadedPortfolio(id: string, data: Awaited<ReturnType<typeof loadPortfolio>>) {
    const place = rememberedPortfolio(id) ?? { id, key: null };
    savedId.current = id;
    dirty.current = false;
    setActiveTabId(id);
    setSaved(place);
    setPortfolioName(data.name);
    setHoldings(data.holdings);
    setTarget(data.target);
    setTouched(new Set());
    setMaxNew(2);
    setResult(null);
    setPlanError(null);
    setPlanning(false);
    setActivePlan(0);
    setTurns([]);
    setConnected(null);
    setProviderData(new Map());
    setPrices(new Map());
    setSaveState("saved");
    setTabs((current) => current.map((tab) => tab.id === id
      ? { ...tab, name: data.name, key: place.key }
      : tab));
    setUrl(id);
    setReady(true);
  }

  async function selectTab(id: string) {
    if (id === activeTabId || switching) return;
    cancelPendingChat();
    setSwitching(true);
    try {
      await persistCurrent();
      setReady(false);
      const data = await loadPortfolio(id);
      showLoadedPortfolio(id, data);
    } catch {
      setReady(true);
      toast("Couldn’t save or open that portfolio. Your current tab is still open.", "error");
    } finally {
      setSwitching(false);
    }
  }

  async function newPortfolio() {
    if (switching) return;
    cancelPendingChat();
    setSwitching(true);
    try {
      await persistCurrent();
      const names = new Set(tabs.map((tab) => tab.name));
      let number = 1;
      while (names.has(`Portfolio ${number}`)) number += 1;
      const name = `Portfolio ${number}`;
      const place = await createPortfolio(name);
      const tab = { ...place, name };
      dirty.current = false;
      savedId.current = place.id;
      setTabs((current) => [...current, tab]);
      setActiveTabId(place.id);
      setSaved(place);
      setPortfolioName(name);
      setHoldings([]);
      setTarget(null);
      setTouched(new Set());
      setMaxNew(2);
      setResult(null);
      setPlanError(null);
      setActivePlan(0);
      setTurns([]);
      setConnected(null);
      setProviderData(new Map());
      setPrices(new Map());
      setSaveState("saved");
      setUrl(place.id);
      setReady(true);
    } catch {
      toast("Couldn’t create a new portfolio. Please try again.", "error");
    } finally {
      setSwitching(false);
    }
  }

  async function closeTab(id: string) {
    if (switching) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const remaining = tabs.filter((tab) => tab.id !== id);
    if (id !== activeTabId) {
      setTabs(remaining);
      return;
    }

    cancelPendingChat();
    setSwitching(true);
    try {
      await persistCurrent();
      const next = remaining[index] ?? remaining[index - 1] ?? null;
      if (next) {
        setReady(false);
        const data = await loadPortfolio(next.id);
        setTabs(remaining);
        showLoadedPortfolio(next.id, data);
      } else {
        setTabs([]);
        setActiveTabId(null);
        savedId.current = null;
        dirty.current = false;
        setSaved(null);
        setPortfolioName("My ETFs");
        setHoldings([]);
        setTarget(null);
        setTouched(new Set());
        setMaxNew(2);
        setResult(null);
        setPlanError(null);
        setActivePlan(0);
        setTurns([]);
        setConnected(null);
        setProviderData(new Map());
        setPrices(new Map());
        setSaveState("idle");
        setUrl(null);
        setReady(true);
      }
    } catch {
      setReady(true);
      toast("Couldn’t save or open the next portfolio. The current tab is still open.", "error");
    } finally {
      setSwitching(false);
    }
  }

  async function renameTab(id: string, name: string) {
    const tab = tabs.find((item) => item.id === id);
    if (!tab || switching) return;
    const isActive = id === activeTabId;
    if (isActive) cancelPendingChat();
    setSwitching(true);
    try {
      let portfolioId = id;
      let place = { id: tab.id, key: tab.key };
      let data: Awaited<ReturnType<typeof loadPortfolio>>;

      if (isActive) {
        await persistCurrent();
        portfolioId = savedId.current ?? id;
        place = rememberedPortfolio(portfolioId) ?? place;
        data = { name: portfolioName, holdings, target };
      } else if (!place.key) {
        data = await loadPortfolio(id);
      } else {
        data = { name: tab.name, holdings: [], target: null };
      }

      if (place.key) {
        await renamePortfolio(place, name);
        setTabs((current) => current.map((item) => item.id === portfolioId
          ? { ...item, name }
          : item));
      } else {
        // A shared link has no edit key. Renaming is still a user edit, so fork it first.
        const { place: copy } = await savePortfolio(null, data.holdings, data.target, name);
        setTabs((current) => current.map((item) => item.id === id
          ? { ...item, id: copy.id, name, key: copy.key }
          : item));
        if (isActive) {
          dirty.current = false;
          savedId.current = copy.id;
          setActiveTabId(copy.id);
          setSaved(copy);
          setUrl(copy.id);
          setSaveState("saved");
        }
        toast("Renamed in your own copy. The shared portfolio was left unchanged.", "info");
      }
      if (isActive) setPortfolioName(name);
    } catch {
      toast("Couldn’t rename this portfolio. Please try again.", "error");
    } finally {
      setSwitching(false);
    }
  }

  function moveTab(id: string, beforeId: string) {
    setTabs((current) => {
      const from = current.findIndex((tab) => tab.id === id);
      const to = current.findIndex((tab) => tab.id === beforeId);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  const match = distance === null ? null : 1 - distance;
  const best = plans.length ? plans.reduce((a, b) => (b.distance < a.distance ? b : a)) : null;
  const held = useMemo(() => new Set(holdings.map((h) => h.ticker)), [holdings]);

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[1920px] flex-col bg-canvas min-[1922px]:border-x min-[1922px]:border-line">
      <TopBar
        covered={covered}
        held={held}
        onPick={addEtf}
        focusKey={focusKey}
        save={saveShown}
        owner={Boolean(saved?.key)}
        canShare={Boolean(saved)}
        onShare={copyLink}
      />
      <PortfolioTabs
        tabs={tabs}
        activeId={activeTabId}
        disabled={switching}
        onSelect={(id) => void selectTab(id)}
        onCreate={() => void newPortfolio()}
        onClose={(id) => void closeTab(id)}
        onRename={renameTab}
        onMove={moveTab}
      />
      {/* Phones: one column. 768-1279px: holdings and Scythe on the left, mix and moves on the right.
          From 1280px: three columns that fill the window, scrolling as a page when it is too short. */}
      <main id="planner-portfolio-panel" className="min-h-0 flex-1 overflow-auto" aria-busy={switching}>
        <div className="grid grid-cols-1 [grid-template-areas:'holdings'_'main'_'scythe'] md:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:[grid-template-areas:'holdings_main'_'scythe_main'] xl:h-full xl:min-h-[680px] xl:grid-cols-[272px_minmax(0,1fr)_336px] xl:grid-rows-1 xl:[grid-template-areas:'holdings_main_scythe'] 2xl:grid-cols-[320px_minmax(0,1fr)_400px]">
          <div className="border-b border-line [grid-area:holdings] md:border-r xl:flex xl:min-h-0 xl:flex-col xl:border-b-0">
            <HoldingsSection
              holdings={holdings}
              funds={funds}
              covered={covered}
              flash={flash}
              providerData={providerData}
              prices={prices}
              onAmount={(ticker, v) => edit(setHoldings)(holdings.map((h) => (h.ticker === ticker ? { ...h, amount: v } : h)))}
              onRemove={(ticker) => edit(setHoldings)(holdings.filter((h) => h.ticker !== ticker))}
              onAdd={addEtf}
              onExample={loadExample}
              onFocusSearch={() => setFocusKey((k) => k + 1)}
            />
          </div>
          <div className="flex min-w-0 flex-col divide-y divide-line border-b border-line [grid-area:main] md:border-b-0 xl:min-h-0">
            <div className="flex flex-col xl:min-h-0 xl:flex-[3]">
              <MixSection
                current={current}
                target={target}
                match={match}
                matchAfter={best ? 1 - best.distance : null}
                funds={result?.funds ?? []}
                hasHoldings={hasHoldings}
                onSector={moveSlider}
                onReset={resetTarget}
              />
            </div>
            <div className="flex flex-col xl:min-h-0 xl:flex-[2]">
              <MovesSection
                plans={plans}
                active={activePlan}
                onActive={setActivePlan}
                hasTarget={target !== null}
                hasHoldings={hasHoldings}
                loading={planning}
                error={planError}
                maxNew={maxNew}
                onMaxNew={setMaxNew}
                onApply={applyPlan}
              />
            </div>
          </div>
          <div className="border-line [grid-area:scythe] md:border-r xl:flex xl:min-h-0 xl:flex-col xl:border-r-0 xl:border-l">
            {/* Scythe waits until the mix is loaded, so it reads your real mix rather than an empty one. */}
            <ScytheSection turns={turns} busy={chatBusy} waiting={holdings.length > 0 && !result} onSend={sendChat} connected={connected} />
          </div>
        </div>
      </main>
      <StatusBar />
      <Toasts toasts={toasts} />
      {switching && (
        <div role="status" className="absolute inset-0 z-50 flex items-center justify-center bg-canvas/55 backdrop-blur-[1px]">
          <span className="rounded-lg border border-line-2 bg-panel px-4 py-3 text-sm text-fg shadow-xl">Switching portfolio…</span>
        </div>
      )}
    </div>
  );
}
