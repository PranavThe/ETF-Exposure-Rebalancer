"use client";

import type { ProviderHoldingChanges, ProviderPrice } from "@/lib/api";
import { pct } from "@/lib/format";
import { usd, type CoveredEtf, type Holding, type PlanFund } from "@/lib/planner";

import AmountInput from "./AmountInput";
import { EtfSearch } from "./TopBar";
import { AnimatedNumber, Monogram, Pane } from "./ui";

const SOURCE: Record<string, string> = { sec: "SEC filing", issuer: "Issuer file", tickerinside: "TickerInside" };

/** The largest positions TickerInside reports for a fund, with the latest IEX closing price. */
function TopHoldings({ data, prices }: { data: ProviderHoldingChanges; prices: Map<string, ProviderPrice> }) {
  return (
    <details className="group/top mt-2 ml-[40px] rounded-md bg-canvas px-2.5 py-1.5 text-[11px] text-muted ring-1 ring-line">
      <summary className="cursor-pointer list-none select-none text-faint transition-colors hover:text-fg">
        <span className="inline-block transition-transform group-open/top:rotate-90">›</span> Top holdings
      </summary>
      <ul className="mt-1.5 space-y-1">
        {data.holdings.slice(0, 5).map((item) => {
          const price = prices.get(item.ticker);
          return (
            <li key={item.ticker} className="flex justify-between gap-2 font-mono">
              <span className="text-fg">
                {item.ticker} <span className="text-muted">{pct(item.weight)}</span>
              </span>
              <span className="text-faint">{price ? `$${price.close.toFixed(2)}` : "—"}</span>
            </li>
          );
        })}
      </ul>
      {data.no_longer_reported.length > 0 && (
        <p className="mt-1.5 leading-relaxed text-faint">
          No longer listed since {data.previous_as_of_date}: {data.no_longer_reported.slice(0, 5).map((item) => item.ticker).join(", ")}
          {data.no_longer_reported.length > 5 ? " …" : ""}. A change in what is reported isn’t necessarily portfolio activity.
        </p>
      )}
      <p className="mt-1.5 text-faint">Weights from TickerInside; prices are Alpaca IEX closes.</p>
    </details>
  );
}

/** Left column: the ETFs the user holds and the dollars in each. */
export default function HoldingsPanel({
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
}) {
  const total = holdings.reduce((a, h) => a + h.amount, 0);

  return (
    <Pane
      tabs={[{ id: "etfs", label: "Holdings", badge: holdings.length || undefined }]}
      active="etfs"
      className="lg:h-full"
      bodyClassName="flex flex-col"
      right={
        holdings.length > 0 && (
          <span className="font-mono text-[13px] text-fg">
            <AnimatedNumber value={total} format={(v) => usd(v)} />
          </span>
        )
      }
      footer={
        holdings.length > 0 && (
          <button
            type="button"
            onClick={onFocusSearch}
            className="hidden w-full items-center justify-center gap-2 py-3 text-[13px] font-medium text-muted transition-colors hover:bg-panel-2 hover:text-fg md:flex"
          >
            <span className="text-base leading-none">+</span> Add ETF
            <kbd className="rounded border border-line px-1 font-mono text-[10px] text-faint">/</kbd>
          </button>
        )
      }
    >
      <div className="border-b border-line p-3 md:hidden">
        <EtfSearch covered={covered} held={new Set(holdings.map((h) => h.ticker))} onPick={onAdd} focusKey={0} />
      </div>

      {holdings.length === 0 ? (
        <div className="relative flex flex-1 flex-col justify-center overflow-hidden px-5 py-8">
          <div aria-hidden className="dot-matrix absolute -right-10 -top-10 h-48 w-48 opacity-60" />
          <p className="label relative">Step 1</p>
          <h2 className="relative mt-2 text-xl font-medium leading-snug text-fg">Add the ETFs you own</h2>
          <p className="relative mt-2 text-sm leading-relaxed text-muted">
            Search any U.S.-listed ETF and type how many dollars you have in it. We look inside each fund and show
            your real sector mix.
          </p>
          <div className="relative mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={onExample}
              className="rounded-md bg-accent-strong px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(122,115,240,0.7)] transition-all hover:bg-accent hover:text-canvas active:scale-[0.98]"
            >
              Try an example portfolio
            </button>
            <button
              type="button"
              onClick={onFocusSearch}
              className="hidden rounded-md border border-line-2 px-4 py-2.5 text-sm text-fg transition-colors hover:border-accent-strong/60 md:block"
            >
              Search ETFs <kbd className="ml-1 rounded border border-line px-1 font-mono text-[10px] text-faint">⌘K</kbd>
            </button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line/80">
          {holdings.map((h, i) => {
            const fund = funds.get(h.ticker);
            const noData = fund?.status === "missing";
            const share = total > 0 ? h.amount / total : 0;
            return (
              <li
                key={h.ticker}
                className={`group relative animate-fade-up px-3 py-3 transition-colors hover:bg-panel-2/60 ${flash.has(h.ticker) ? "flash" : ""}`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Monogram ticker={h.ticker} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px] font-semibold text-fg">{h.ticker}</span>
                      {noData ? (
                        <span className="rounded bg-activity/15 px-1.5 py-px font-mono text-[10px] text-activity">no data yet</span>
                      ) : (
                        <span className="font-mono text-[11px] text-faint">{pct(share)}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted" title={h.name}>
                      {h.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(h.ticker)}
                    aria-label={`Remove ${h.ticker}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-faint opacity-60 transition-all hover:bg-down/10 hover:text-down group-hover:opacity-100"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2.5 flex items-center gap-3 pl-[40px]">
                  <AmountInput value={h.amount} onValue={(v) => onAmount(h.ticker, v)} label={`Dollars in ${h.ticker}`} className="w-32" />
                  <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-3">
                    <div className="bar-anim h-full rounded-full bg-accent/80" style={{ width: `${share * 100}%` }} />
                  </div>
                </div>
                {noData && (
                  <p className="mt-2 pl-[40px] text-[11px] leading-relaxed text-faint">
                    Its holdings aren’t loaded yet, so it stays out of your mix and the moves.
                  </p>
                )}
                {fund?.as_of_date && (
                  <p className="mt-1.5 pl-[40px] font-mono text-[10px] text-faint">
                    {SOURCE[fund.source_provider ?? ""] ?? "Holdings"}
                    {fund.source_layer ? ` · ${fund.source_layer}` : ""} · as of {fund.as_of_date}
                  </p>
                )}
                {providerData.get(h.ticker) && <TopHoldings data={providerData.get(h.ticker)!} prices={prices} />}
              </li>
            );
          })}
        </ul>
      )}
    </Pane>
  );
}
