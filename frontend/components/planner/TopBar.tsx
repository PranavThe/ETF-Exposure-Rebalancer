"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import type { Fund } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { pct } from "@/lib/format";
import { planner, sectorColor, type CoveredEtf } from "@/lib/planner";

import { Monogram } from "./ui";

type Option = { ticker: string; name: string; covered?: CoveredEtf; hasData: boolean; held: boolean };

function MiniMix({ etf }: { etf: CoveredEtf }) {
  return (
    <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-panel-3">
      {etf.sectors.map((s) => (
        <span key={s.sector} style={{ width: `${s.weight * 100}%`, background: sectorColor(s.sector) }} />
      ))}
    </span>
  );
}

/** Kairos-style centred search: every listed ETF, the ones with sector data first. */
function EtfSearch({
  covered,
  held,
  onPick,
  focusKey,
}: {
  covered: CoveredEtf[];
  held: Set<string>;
  onPick: (etf: { ticker: string; name: string }) => void;
  focusKey: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [found, setFound] = useState<{ term: string; funds: Fund[] } | null>(null);
  const term = query.trim();

  useEffect(() => {
    if (focusKey) input.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      planner.search(term, controller.signal).then(
        (funds) => !controller.signal.aborted && setFound({ term, funds }),
        () => !controller.signal.aborted && setFound({ term, funds: [] }),
      );
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const options = useMemo<Option[]>(() => {
    const q = term.toLowerCase();
    const rank = (t: string) => (t.toLowerCase() === q ? 0 : t.toLowerCase().startsWith(q) ? 1 : 2);
    const byTicker = new Map(covered.map((c) => [c.ticker, c]));
    const fromCovered = covered
      .filter((e) => !e.sample && (!q || e.ticker.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)))
      .map((e) => ({ ticker: e.ticker, name: e.name, covered: e, hasData: true, held: held.has(e.ticker) }));
    const seen = new Set(fromCovered.map((o) => o.ticker));
    const fromSearch = (found?.term === term ? found.funds : [])
      .filter((f) => !seen.has(f.ticker))
      .map((f) => ({ ticker: f.ticker, name: f.name, covered: byTicker.get(f.ticker), hasData: f.snapshot_count > 0 || Boolean(f.provider_holdings_as_of_date), held: held.has(f.ticker) }));
    // ETFs already held stay listed (marked), so typing one's ticker never picks the next match.
    return [...fromCovered, ...fromSearch]
      .sort((a, b) => rank(a.ticker) - rank(b.ticker) || Number(a.held) - Number(b.held) || Number(b.hasData) - Number(a.hasData))
      .slice(0, 40);
  }, [covered, found, term, held]);
  const searching = Boolean(term) && found?.term !== term;
  const active = Math.min(cursor, Math.max(0, options.length - 1));

  function pick(o: Option) {
    onPick({ ticker: o.ticker, name: o.name });
    setQuery("");
    setCursor(0);
  }

  return (
    <div className="relative w-full max-w-[560px]">
      <div className={`flex h-9 items-center gap-2 rounded-lg border bg-panel px-3 transition-all duration-200 ${open ? "border-accent-strong/70 shadow-[0_0_0_3px_rgba(122,115,240,0.15)]" : "border-line hover:border-line-2"}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-faint" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => document.activeElement !== input.current && setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor(Math.min(active + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor(Math.max(active - 1, 0));
            } else if (e.key === "Enter" && options[active]) {
              pick(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="Add an ETF you own — ticker or name"
          aria-label="Add an ETF"
          role="combobox"
          aria-expanded={open}
          aria-controls="etf-search-results"
          aria-activedescendant={options[active] ? `etf-opt-${options[active].ticker}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 font-mono text-[10px] text-faint sm:block">⌘K</kbd>
      </div>
      {open && (
        <div className="absolute inset-x-0 top-11 z-40 animate-fade-in overflow-hidden rounded-lg border border-line-2 bg-panel-2/98 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="label">{term ? "Results" : "Popular ETFs with sector data"}</span>
            <span className="font-mono text-[10px] text-faint">↑↓ to move · ↵ to add</span>
          </div>
          <ul id="etf-search-results" role="listbox" className="max-h-[360px] overflow-auto py-1">
            {options.map((o, i) => (
              <li key={o.ticker} id={`etf-opt-${o.ticker}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${i === active ? "bg-panel-3" : ""}`}
                >
                  <Monogram ticker={o.ticker} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-semibold text-fg">{o.ticker}</span>
                    <span className="block truncate text-xs text-muted">{o.name}</span>
                  </span>
                  {o.held ? (
                    <span className="shrink-0 rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[10px] text-muted">added</span>
                  ) : o.covered ? (
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <MiniMix etf={o.covered} />
                      <span className="font-mono text-[10px] text-faint">
                        {o.covered.sectors.slice().sort((a, b) => b.weight - a.weight)[0]?.sector}{" "}
                        {pct(o.covered.sectors.slice().sort((a, b) => b.weight - a.weight)[0]?.weight ?? 0, 0)}
                      </span>
                    </span>
                  ) : (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${o.hasData ? "bg-up/10 text-up" : "bg-panel-3 text-faint"}`}>
                      {o.hasData ? "sector data" : "no data yet"}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {term && searching && options.length === 0 && (
              <li className="space-y-2 px-3 py-3">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-1/2" />
              </li>
            )}
            {term && !searching && options.length === 0 && <li className="px-3 py-3 text-sm text-muted">No ETF matches “{term}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export default function TopBar({
  covered,
  held,
  onPick,
  focusKey,
  save,
  owner,
  canShare,
  onShare,
}: {
  covered: CoveredEtf[];
  held: Set<string>;
  onPick: (etf: { ticker: string; name: string }) => void;
  focusKey: number;
  save: SaveStatus;
  owner: boolean;
  canShare: boolean;
  onShare: () => void;
}) {
  const saveText =
    save === "saved" ? (owner ? "Saved" : "Shared view") : save === "saving" || save === "pending" ? "Saving" : save === "error" ? "Not saved" : "Draft";
  const saveDot = save === "saved" ? "bg-up" : save === "error" ? "bg-down" : save === "idle" ? "bg-faint" : "bg-activity";

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/80 px-3 backdrop-blur sm:gap-5 sm:px-5">
      <Link
        href="/"
        className="inline-flex shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`${BRAND} home`}
      >
        <BrandLogo width={132} loading="eager" />
      </Link>
      <nav className="hidden items-center gap-5 text-[15px] lg:flex">
        <span className="text-accent">Planner</span>
        <Link href="/methodology" className="text-fg/80 transition-colors hover:text-fg">
          How it works
        </Link>
      </nav>
      <div className="hidden flex-1 justify-center md:flex">
        <EtfSearch covered={covered} held={held} onPick={onPick} focusKey={focusKey} />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        <span
          className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px] text-muted sm:flex"
          title={owner ? "Saved to your link. Only this browser can edit it." : "Changes save as your own copy."}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${saveDot} ${save === "saving" ? "animate-pulse" : ""}`} />
          {saveText}
        </span>
        {canShare && (
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 rounded-md bg-fg px-3 py-1.5 text-[13px] font-medium text-canvas transition-transform hover:bg-white active:scale-[0.97]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" />
              <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
            </svg>
            Share
          </button>
        )}
      </div>
    </header>
  );
}

export { EtfSearch };
