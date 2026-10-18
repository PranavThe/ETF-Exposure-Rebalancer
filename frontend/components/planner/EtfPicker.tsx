"use client";

import { useEffect, useMemo, useState } from "react";

import type { Fund } from "@/lib/api";
import { planner, type CoveredEtf } from "@/lib/planner";

type Option = { ticker: string; name: string; covered: boolean; source?: string; asOf?: string };

/** Search every listed ETF; ETFs with sector data come first. */
export default function EtfPicker({
  covered,
  exclude,
  onPick,
}: {
  covered: CoveredEtf[];
  exclude: Set<string>;
  onPick: (etf: { ticker: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ term: string; funds: Fund[] } | null>(null);
  const term = query.trim();

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      planner.search(term, controller.signal).then(
        (funds) => !controller.signal.aborted && setFound({ term, funds }),
        () => !controller.signal.aborted && setFound({ term, funds: [] }),
      );
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const options = useMemo<Option[]>(() => {
    const q = term.toLowerCase();
    const withData = covered
      .filter((e) => !e.sample && (!q || e.ticker.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.ticker.toLowerCase() === q) - Number(a.ticker.toLowerCase() === q))
      .map((e) => ({ ticker: e.ticker, name: e.name, covered: true,
        source: e.source_provider === "tickerinside" ? "TickerInside" : "SEC / issuer",
        asOf: e.as_of_date }));
    const seen = new Set(withData.map((o) => o.ticker));
    const rest = (found?.term === term ? found.funds : [])
      .filter((f) => !seen.has(f.ticker))
      .sort((a, b) => Number(b.ticker.toLowerCase() === q) - Number(a.ticker.toLowerCase() === q))
      .map((f) => ({ ticker: f.ticker, name: f.name, covered: false,
        source: f.provider_holdings_as_of_date ? "TickerInside" : undefined,
        asOf: f.provider_holdings_as_of_date ?? f.latest_as_of_date ?? undefined }));
    return [...withData, ...rest].filter((o) => !exclude.has(o.ticker)).slice(0, 30);
  }, [covered, found, term, exclude]);
  const searching = Boolean(term) && found?.term !== term;

  function pick(o: Option) {
    onPick({ ticker: o.ticker, name: o.name });
    setQuery("");
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && options[0]) pick(options[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Add an ETF: ticker or name"
        aria-label="Add an ETF"
        role="combobox"
        aria-expanded={open}
        aria-controls="etf-options"
        className="h-9 w-full rounded-md border border-line bg-canvas px-3 text-sm text-fg placeholder:text-faint focus:border-accent-strong focus:outline-none"
      />
      {open && (options.length > 0 || term) && (
        <ul
          id="etf-options"
          role="listbox"
          className="absolute inset-x-0 top-10 z-30 max-h-72 overflow-auto rounded-md border border-line-2 bg-panel-2 py-1 shadow-xl"
        >
          {!term && <li className="label px-3 pb-1 pt-1.5">ETFs with holdings data</li>}
          {options.map((o) => (
            <li key={o.ticker} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel-3"
              >
                <span className="w-14 shrink-0 font-mono font-semibold">{o.ticker}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{o.name}</span>
                <span className={`shrink-0 font-mono text-[10px] ${o.covered ? "text-up" : "text-faint"}`}>
                  {o.covered ? `${o.source} · ${o.asOf}` : o.source ? `${o.source} · ${o.asOf}` : "no data yet"}
                </span>
              </button>
            </li>
          ))}
          {term && searching && options.length === 0 && <li className="px-3 py-2 text-xs text-muted">Searching…</li>}
          {term && !searching && options.length === 0 && <li className="px-3 py-2 text-xs text-muted">No ETF matches “{term}”.</li>}
        </ul>
      )}
    </div>
  );
}
