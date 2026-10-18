"use client";

import Panel from "@/components/ui/Panel";
import { pct } from "@/lib/format";
import { usd, type CoveredEtf, type Holding, type PlanFund } from "@/lib/planner";

import AmountInput from "./AmountInput";
import EtfPicker from "./EtfPicker";

/** Left column: the ETFs the user holds and the dollars in each. */
export default function HoldingsPanel({
  holdings,
  funds,
  covered,
  onAmount,
  onRemove,
  onAdd,
  onExample,
}: {
  holdings: Holding[];
  funds: Map<string, PlanFund>;
  covered: CoveredEtf[];
  onAmount: (ticker: string, amount: number) => void;
  onRemove: (ticker: string) => void;
  onAdd: (etf: { ticker: string; name: string }) => void;
  onExample: () => void;
}) {
  const total = holdings.reduce((a, h) => a + h.amount, 0);
  const missing = holdings.filter((h) => funds.get(h.ticker)?.status === "missing");
  const missingTotal = missing.reduce((a, h) => a + h.amount, 0);

  return (
    <Panel
      tabs={[{ id: "etfs", label: "Your ETFs", count: holdings.length }]}
      active="etfs"
      className="lg:h-full"
      bodyClassName="flex flex-col"
    >
      <div className="border-b border-line px-4 py-3">
        <p className="label">Total value</p>
        <p className="mt-1 font-mono text-2xl tabular-nums text-fg">{usd(total)}</p>
      </div>

      <div className="px-3 pt-3">
        <EtfPicker covered={covered} exclude={new Set(holdings.map((h) => h.ticker))} onPick={onAdd} />
      </div>

      {holdings.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted">
          <p>Add the ETFs you own and how much is in each. Your sector mix appears in the middle.</p>
          <button
            type="button"
            onClick={onExample}
            className="mt-3 rounded-md border border-line-2 px-3 py-1.5 text-sm text-fg hover:border-accent-strong hover:text-accent"
          >
            Try an example portfolio
          </button>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {holdings.map((h) => {
            const fund = funds.get(h.ticker);
            const noData = fund?.status === "missing";
            return (
              <li key={h.ticker} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{h.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted" title={h.name}>{h.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(h.ticker)}
                    aria-label={`Remove ${h.ticker}`}
                    className="rounded px-1 text-faint hover:text-down"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <AmountInput value={h.amount} onValue={(v) => onAmount(h.ticker, v)} label={`Dollars in ${h.ticker}`} className="flex-1" />
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                    {total > 0 ? pct(h.amount / total, 0) : "–"}
                  </span>
                </div>
                {noData && (
                  <p className="mt-1 text-[11px] text-faint">No holdings data yet, so it isn’t counted in your mix.</p>
                )}
                {fund?.as_of_date && (
                  <p className="mt-1 font-mono text-[10px] text-faint">holdings as of {fund.as_of_date}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {missing.length > 0 && (
        <p className="mt-auto border-t border-line px-4 py-2.5 text-xs text-muted">
          {usd(missingTotal)} in {missing.map((m) => m.ticker).join(", ")} is kept out of the mix and the moves until
          its holdings are loaded.
        </p>
      )}
    </Panel>
  );
}
