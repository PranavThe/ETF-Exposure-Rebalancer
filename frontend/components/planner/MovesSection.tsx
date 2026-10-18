"use client";

import { pct } from "@/lib/format";
import { usd, type MoveAction, type Plan } from "@/lib/planner";

import { Monogram, SectionHeader, Skeleton, Stepper, TextTabs } from "./ui";

export const PLAN_LABEL: Record<string, string> = {
  rearrange: "Rearrange what you own",
  rearrange_with_new: "Add new ETFs",
};

const ACTION: Record<MoveAction, { label: string; tone: string }> = {
  add: { label: "Add", tone: "text-accent" },
  increase: { label: "Increase", tone: "text-up" },
  reduce: { label: "Reduce", tone: "text-down" },
  remove: { label: "Remove", tone: "text-down" },
};

/** The selected plan's moves, with the plan choice and Apply in the header. */
export default function MovesSection({
  plans,
  active,
  onActive,
  hasTarget,
  hasHoldings,
  loading,
  error,
  maxNew,
  onMaxNew,
  onApply,
  logo = (ticker: string) => <Monogram ticker={ticker} size={26} />,
}: {
  plans: Plan[];
  active: number;
  onActive: (i: number) => void;
  hasTarget: boolean;
  hasHoldings: boolean;
  loading: boolean;
  error: string | null;
  maxNew: number;
  onMaxNew: (n: number) => void;
  onApply: (plan: Plan) => void;
  logo?: (ticker: string, name: string) => React.ReactNode;
}) {
  const plan = plans[Math.min(active, plans.length - 1)];

  return (
    <section className="flex flex-1 flex-col xl:min-h-0">
      <SectionHeader
        title="Suggested moves"
        sub={plan ? plan.summary : hasTarget ? (loading ? "Working out the moves…" : "") : "Set your target and the moves to reach it appear here."}
        right={
          <>
            <span className="flex items-center gap-2 whitespace-nowrap text-[12.5px] text-muted">
              New ETFs up to
              <Stepper value={maxNew} min={0} max={3} onChange={onMaxNew} label="New ETFs allowed" />
            </span>
            <button
              type="button"
              disabled={!plan}
              onClick={() => plan && onApply(plan)}
              title="Updates your amounts to preview the result. Nothing is placed with a broker."
              className="rounded-md bg-accent-strong px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent hover:text-canvas active:scale-[0.98] disabled:bg-panel-3 disabled:text-faint"
            >
              Use these amounts
            </button>
          </>
        }
      />

      {plans.length > 1 && (
        <div className="border-b border-line px-6">
          <TextTabs
            label="Plans"
            active={String(Math.min(active, plans.length - 1))}
            onTab={(id) => onActive(Number(id))}
            tabs={plans.map((p, i) => ({ id: String(i), label: PLAN_LABEL[p.kind] ?? p.title, badge: `${pct(1 - p.distance)} match` }))}
          />
        </div>
      )}

      <div className="@container overflow-x-auto px-6 pb-4 xl:min-h-0 xl:flex-1 xl:overflow-auto">
        {error ? (
          <p className="py-6 text-sm text-down">{error}</p>
        ) : !hasTarget || !hasHoldings ? (
          <div className="flex flex-wrap items-center gap-2 py-8 text-[13px] text-faint">
            {["Add", "Increase", "Reduce"].map((a) => (
              <span key={a} className="rounded-full border border-line px-2.5 py-1">
                {a}
              </span>
            ))}
            <span className="sm:ml-2">moves show up here once you have ETFs and a target.</span>
          </div>
        ) : !plan ? (
          loading ? (
            <div className="space-y-3 py-4">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <p className="py-8 text-[13px] text-muted">You’re as close as these ETFs allow. Allow new ETFs above to get closer.</p>
          )
        ) : (
          <table className="w-full max-w-[1100px] text-[13.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-faint">
                <th className="py-2.5 font-normal">Move</th>
                <th className="py-2.5 font-normal">ETF</th>
                <th className="hidden py-2.5 pl-4 text-right font-normal @[34rem]:table-cell">Now</th>
                <th className="hidden py-2.5 pl-4 text-right font-normal @[34rem]:table-cell">After</th>
                <th className="py-2.5 pl-4 text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {plan.moves.map((m, i) => {
                const up = m.action === "add" || m.action === "increase";
                return (
                  <tr key={`${plan.kind}-${m.ticker}-${m.amount}`} className="animate-fade-up border-t border-line/60" style={{ animationDelay: `${i * 45}ms` }}>
                    <td className={`py-3 pr-3 font-medium ${ACTION[m.action].tone}`}>{ACTION[m.action].label}</td>
                    <td className="py-3 pr-3">
                      <span className="flex min-w-0 items-center gap-3">
                        {logo(m.ticker, m.name)}
                        <span className="min-w-0">
                          <span className="block font-mono font-semibold text-fg">{m.ticker}</span>
                          <span className="block max-w-[260px] truncate text-[11.5px] text-faint">{m.name}</span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap py-3 pl-4 text-right font-mono tabular-nums text-muted @[34rem]:table-cell">{usd(m.before)}</td>
                    <td className="hidden whitespace-nowrap py-3 pl-4 text-right font-mono tabular-nums text-fg @[34rem]:table-cell">{usd(m.after)}</td>
                    <td className={`whitespace-nowrap py-3 pl-4 text-right font-mono tabular-nums ${up ? "text-up" : "text-down"}`}>
                      {up ? "+" : "−"}
                      {usd(m.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
