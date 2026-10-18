"use client";

import { ppDistance } from "@/lib/format";
import { usd, type MoveAction, type Plan } from "@/lib/planner";

import { Monogram, Pane, Skeleton } from "./ui";

export const PLAN_LABEL: Record<string, string> = {
  rearrange: "Rearrange",
  rearrange_with_new: "With new ETFs",
  add_money: "Add only",
  add_and_rearrange: "Add + rearrange",
  withdraw: "Reduce only",
  withdraw_and_rearrange: "Take out + rearrange",
  start: "Start",
};

const ACTION: Record<MoveAction, { label: string; tone: string }> = {
  add: { label: "ADD", tone: "text-accent bg-accent/10 ring-accent/30" },
  increase: { label: "INCREASE", tone: "text-up bg-up/10 ring-up/30" },
  reduce: { label: "REDUCE", tone: "text-down bg-down/10 ring-down/30" },
  remove: { label: "REMOVE", tone: "text-down bg-down/10 ring-down/30" },
};

/** Centre, below the mix: the selected plan's moves as a terminal table. */
export default function MovesPanel({
  plans,
  active,
  onActive,
  hasTarget,
  loading,
  error,
}: {
  plans: Plan[];
  active: number;
  onActive: (i: number) => void;
  hasTarget: boolean;
  loading: boolean;
  error: string | null;
}) {
  const plan = plans[Math.min(active, plans.length - 1)];
  const tabs = plans.length
    ? plans.map((p, i) => ({ id: String(i), label: PLAN_LABEL[p.kind] ?? p.title, badge: p.moves.length }))
    : [{ id: "0", label: "Moves" }];

  return (
    <Pane
      tabs={tabs}
      active={plan ? String(Math.min(active, plans.length - 1)) : "0"}
      onTab={(id) => onActive(Number(id))}
      className="min-h-[300px] lg:min-h-0 lg:flex-[2]"
      right={
        loading ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> updating
          </span>
        ) : plan ? (
          <span className="hidden font-mono text-[12px] sm:inline">
            within <span className="text-fg">{ppDistance(plan.distance)}</span> · moves{" "}
            <span className="text-fg">{usd(plan.moves.filter((m) => m.action === "reduce" || m.action === "remove").reduce((a, m) => a + m.amount, 0))}</span>
          </span>
        ) : undefined
      }
    >
      {error ? (
        <p className="p-4 text-sm text-down">{error}</p>
      ) : !hasTarget ? (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="flex items-center gap-2 text-faint">
            <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px]">ADD</span>
            <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px]">INCREASE</span>
            <span className="rounded-md border border-line px-2 py-1 font-mono text-[11px]">REDUCE</span>
          </div>
          <p className="mt-2 text-[15px] text-fg">Your moves show up here</p>
          <p className="max-w-sm text-sm text-muted">Set the mix you want with the handles above or tell the assistant, and we work out what to change.</p>
        </div>
      ) : !plan ? (
        loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center p-6 text-center">
            <p className="text-[15px] text-fg">No moves bring you closer</p>
            <p className="mt-1 max-w-sm text-sm text-muted">You’re as close as these ETFs allow. Allow new ETFs or add money in the plan panel.</p>
          </div>
        )
      ) : (
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="text-left text-faint">
              <th className="px-4 py-2.5 font-normal">Action</th>
              <th className="px-2 py-2.5 font-normal">ETF</th>
              <th className="hidden px-2 py-2.5 text-right font-normal sm:table-cell">Now</th>
              <th className="hidden px-2 py-2.5 text-right font-normal sm:table-cell">After</th>
              <th className="px-4 py-2.5 text-right font-normal">Change</th>
            </tr>
          </thead>
          <tbody>
            {plan.moves.map((m, i) => {
              const up = m.action === "add" || m.action === "increase";
              return (
                <tr
                  key={`${plan.kind}-${m.ticker}-${m.amount}`}
                  className="animate-fade-up border-t border-line/70 transition-colors hover:bg-panel-2/70"
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <td className="px-4 py-2.5">
                    <span className={`inline-block w-[74px] rounded px-1.5 py-0.5 text-center font-mono text-[10.5px] font-semibold tracking-wide ring-1 ${ACTION[m.action].tone}`}>
                      {ACTION[m.action].label}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Monogram ticker={m.ticker} size={24} />
                      <span className="min-w-0">
                        <span className="block font-mono font-semibold text-fg">
                          {m.ticker}
                          {m.action === "add" && <span className="ml-1.5 rounded bg-accent/15 px-1 py-px font-sans text-[10px] font-medium text-accent">NEW</span>}
                        </span>
                        <span className="block max-w-[220px] truncate text-[11px] text-faint">{m.name}</span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-right font-mono tabular-nums text-muted sm:table-cell">{usd(m.before)}</td>
                  <td className="hidden px-2 py-2.5 text-right font-mono tabular-nums text-fg sm:table-cell">{usd(m.after)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-medium tabular-nums ${up ? "text-up" : "text-down"}`}>
                    {up ? "+" : "−"}
                    {usd(m.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Pane>
  );
}
