"use client";

import { useState } from "react";

import type { ProviderHoldingChanges, ProviderPrice } from "@/lib/api";
import { pct } from "@/lib/format";
import { SECTORS, UNCLASSIFIED, sectorColor, toMix, usd, type CoveredEtf, type Holding, type PlanFund } from "@/lib/planner";

import AmountInput from "./AmountInput";
import { EtfSearch } from "./TopBar";
import { AnimatedNumber, Monogram, ScytheMark } from "./ui";

const SOURCE: Record<string, string> = { sec: "SEC filing", issuer: "Issuer file", tickerinside: "TickerInside" };

/** What's behind one holding: where the data came from, its sectors and its largest positions. */
function Details({ fund, provider, prices, onRemove }: { fund?: PlanFund; provider?: ProviderHoldingChanges; prices: Map<string, ProviderPrice>; onRemove: () => void }) {
  const mix = toMix(fund?.sectors);
  return (
    <div className="mt-3 animate-fade-in space-y-3 pl-[44px] text-[12px]">
      {fund?.status === "missing" ? (
        <p className="leading-relaxed text-faint">Its holdings aren’t loaded yet, so it stays out of your mix and the moves.</p>
      ) : fund ? (
        <>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-panel-3">
            {[...SECTORS, UNCLASSIFIED].map((s) =>
              (mix[s] ?? 0) > 0 ? <div key={s} style={{ width: `${mix[s] * 100}%`, background: sectorColor(s) }} title={`${s} ${pct(mix[s])}`} /> : null,
            )}
          </div>
          <p className="text-faint">
            {fund.sectors
              .filter((s) => s.weight >= 0.05)
              .sort((a, b) => b.weight - a.weight)
              .map((s) => `${s.sector} ${pct(s.weight, 0)}`)
              .join(" · ")}
          </p>
          <p className="font-mono text-[11px] text-faint">
            {SOURCE[fund.source_provider ?? ""] ?? "Holdings"}
            {fund.source_layer ? ` · ${fund.source_layer}` : ""} · as of {fund.as_of_date}
          </p>
        </>
      ) : null}
      {provider && (
        <div>
          <p className="mb-1.5 text-faint">Largest positions</p>
          <ul className="space-y-1">
            {provider.holdings.slice(0, 5).map((item) => {
              const price = prices.get(item.ticker);
              return (
                <li key={item.ticker} className="flex justify-between gap-2 font-mono text-[11.5px]">
                  <span className="text-fg">
                    {item.ticker} <span className="text-muted">{pct(item.weight)}</span>
                  </span>
                  <span className="text-faint">{price ? `$${price.close.toFixed(2)}` : "—"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[11px] text-faint">Weights from TickerInside; prices are Alpaca IEX closes.</p>
        </div>
      )}
      <button type="button" onClick={onRemove} className="text-[12px] text-faint transition-colors hover:text-down">
        Remove from holdings
      </button>
    </div>
  );
}

/** Left column: the ETFs the user holds and the dollars in each. */
export default function HoldingsSection({
  holdings,
  funds,
  covered,
  flash,
  providerData,
  prices,
  onAmount,
  onRemove,
  onAdd,
  onExample,
  onFocusSearch,
  logo = (ticker: string) => <Monogram ticker={ticker} size={32} />,
}: {
  holdings: Holding[];
  funds: Map<string, PlanFund>;
  covered: CoveredEtf[];
  flash: Set<string>;
  providerData: Map<string, ProviderHoldingChanges>;
  prices: Map<string, ProviderPrice>;
  onAmount: (ticker: string, amount: number) => void;
  onRemove: (ticker: string) => void;
  onAdd: (etf: { ticker: string; name: string }) => void;
  onExample: () => void;
  onFocusSearch: () => void;
  logo?: (ticker: string, name: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const total = holdings.reduce((a, h) => a + h.amount, 0);

  return (
    <section className="flex flex-col lg:min-h-0">
      <div className="shrink-0 px-6 pb-4 pt-5">
        <h2 className="text-[15px] font-medium text-fg">Holdings</h2>
        <p className="mt-3 font-mono text-[28px] leading-none text-fg">
          <AnimatedNumber value={total} format={(v) => usd(v)} />
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {holdings.length === 0 ? "No ETFs yet" : `across ${holdings.length} ETF${holdings.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="px-6 pb-3 md:hidden">
        <EtfSearch covered={covered} held={new Set(holdings.map((h) => h.ticker))} onPick={onAdd} focusKey={0} />
      </div>

      <div className="lg:min-h-0 lg:flex-1 lg:overflow-auto">
        {holdings.length === 0 ? (
          <div className="px-6 py-6">
            <div className="flex items-center gap-2 text-[12px] text-faint">
              <ScytheMark size={14} /> Start here
            </div>
            <p className="mt-3 text-[18px] leading-snug text-fg">Add the ETFs you own and how much is in each.</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Search any U.S.-listed ETF at the top. We look inside each fund to show your real sector mix.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={onExample}
                className="rounded-md bg-accent-strong px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent hover:text-canvas active:scale-[0.98]"
              >
                Try an example portfolio
              </button>
              <button
                type="button"
                onClick={onFocusSearch}
                className="hidden rounded-md px-4 py-2.5 text-sm text-muted transition-colors hover:text-fg md:block"
              >
                Search ETFs <kbd className="ml-1 rounded border border-line px-1 font-mono text-[10px] text-faint">⌘K</kbd>
              </button>
            </div>
          </div>
        ) : (
          <ul className="border-t border-line">
            {holdings.map((h) => {
              const fund = funds.get(h.ticker);
              const noData = fund?.status === "missing";
              const share = total > 0 ? h.amount / total : 0;
              const expanded = open === h.ticker;
              return (
                <li key={h.ticker} className={`border-b border-line/70 px-6 py-3.5 transition-colors ${expanded ? "bg-panel/50" : ""} ${flash.has(h.ticker) ? "flash" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : h.ticker)}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} details for ${h.ticker}`}
                      className="mt-0.5 shrink-0"
                    >
                      {logo(h.ticker, h.name)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : h.ticker)}
                          className="flex min-w-0 items-center gap-1.5 text-left"
                          tabIndex={-1}
                        >
                          <span className="font-mono text-[14px] font-semibold text-fg">{h.ticker}</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className={`text-faint transition-transform ${expanded ? "rotate-180" : ""}`}>
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        <AmountInput value={h.amount} onValue={(v) => onAmount(h.ticker, v)} label={`Dollars in ${h.ticker}`} className="ml-auto h-8 w-[104px]" />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-muted" title={h.name}>
                          {h.name}
                        </span>
                        {noData ? (
                          <span className="shrink-0 font-mono text-[10.5px] text-activity">no data yet</span>
                        ) : (
                          <span className="shrink-0 font-mono text-[11px] text-faint">{pct(share)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {expanded && <Details fund={fund} provider={providerData.get(h.ticker)} prices={prices} onRemove={() => onRemove(h.ticker)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {holdings.length > 0 && (
        <button
          type="button"
          onClick={onFocusSearch}
          className="hidden shrink-0 items-center gap-2 border-t border-line px-6 py-3.5 text-[13px] text-muted transition-colors hover:text-fg md:flex"
        >
          <span className="text-base leading-none">+</span> Add ETF
          <kbd className="ml-auto rounded border border-line px-1 font-mono text-[10px] text-faint">/</kbd>
        </button>
      )}
    </section>
  );
}
