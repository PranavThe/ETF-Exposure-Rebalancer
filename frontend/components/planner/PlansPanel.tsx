"use client";

import Panel from "@/components/ui/Panel";
import { ppDistance } from "@/lib/format";
import { usd, type MoveAction, type Plan } from "@/lib/planner";

import AmountInput from "./AmountInput";

const SHORT: Record<string, string> = {
  rearrange: "Rearrange",
  rearrange_with_new: "Add new ETFs",
  add_money: "Add only",
  add_and_rearrange: "Add + rearrange",
  withdraw: "Reduce only",
  withdraw_and_rearrange: "Take out + rearrange",
  start: "Start",
};

const ACTION: Record<MoveAction, { label: string; className: string }> = {
  add: { label: "Add", className: "border-accent-strong/60 text-accent" },
  increase: { label: "Increase", className: "border-up/50 text-up" },
  reduce: { label: "Reduce", className: "border-down/50 text-down" },
  remove: { label: "Remove", className: "border-down/50 text-down" },
};

export type MoneyMode = "same" | "add" | "out";

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-line p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded px-2 py-1 text-xs ${o.value === value ? "bg-panel-3 text-fg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Right column, top: money in or out, and the suggested moves toward the target. */
export default function PlansPanel({
  plans,
  active,
  onActive,
  hasTarget,
  hasHoldings,
  beforeDistance,
  loading,
  error,
  money,
  amount,
  maxNew,
  onMoney,
  onAmount,
  onMaxNew,
  onApply,
}: {
  plans: Plan[];
  active: number;
  onActive: (i: number) => void;
  hasTarget: boolean;
  hasHoldings: boolean;
  beforeDistance: number | null;
  loading: boolean;
  error: string | null;
  money: MoneyMode;
  amount: number;
  maxNew: number;
  onMoney: (m: MoneyMode) => void;
  onAmount: (v: number) => void;
  onMaxNew: (n: number) => void;
  onApply: (plan: Plan) => void;
}) {
  const plan = plans[Math.min(active, plans.length - 1)];

  return (
    <Panel
      tabs={plans.length ? plans.map((p, i) => ({ id: String(i), label: SHORT[p.kind] ?? p.title })) : [{ id: "0", label: "Suggested moves" }]}
      active={plan ? String(Math.min(active, plans.length - 1)) : "0"}
      onTab={(id) => onActive(Number(id))}
      right={loading ? <span className="font-mono text-faint">updating…</span> : undefined}
      className="min-h-[320px] lg:min-h-0 lg:flex-[3]"
    >
      <div className="space-y-2 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label w-16">Money</span>
          <Segmented
            label="Money in or out"
            value={money}
            onChange={onMoney}
            options={[
              { value: "same", label: "Same" },
              { value: "add", label: "Add" },
              { value: "out", label: "Take out" },
            ]}
          />
          {money !== "same" && (
            <AmountInput value={amount} onValue={onAmount} label={money === "add" ? "Dollars to add" : "Dollars to take out"} className="w-28" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label w-16">New ETFs</span>
          <Segmented
            label="Most new ETFs to suggest"
            value={maxNew}
            onChange={onMaxNew}
            options={[0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? "None" : `Up to ${n}` }))}
          />
        </div>
      </div>

      {error ? (
        <p className="px-4 py-4 text-sm text-down">{error}</p>
      ) : !hasTarget ? (
        <p className="px-4 py-4 text-sm text-muted">
          Set the mix you want, with the sliders or the assistant, and the moves that get you there show up here.
        </p>
      ) : !plan ? (
        <p className="px-4 py-4 text-sm text-muted">
          {hasHoldings && money === "same" && beforeDistance !== null && beforeDistance < 0.0005
            ? "Your mix already matches this target."
            : hasHoldings || money === "add"
            ? loading
              ? "Working out the moves…"
              : "No moves would bring you closer to this target. Try allowing new ETFs or adding money."
            : "Add your ETFs, or choose Add money to start from cash."}
        </p>
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-fg">{plan.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{plan.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded border border-line bg-canvas px-3 py-2">
              <p className="label">Away from target</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums">
                {beforeDistance !== null && <span className="text-muted">{ppDistance(beforeDistance)} → </span>}
                <span className="text-fg">{ppDistance(plan.distance)}</span>
              </p>
            </div>
            <div className="rounded border border-line bg-canvas px-3 py-2">
              <p className="label">Total after</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-fg">{usd(plan.total_after)}</p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-line rounded border border-line">
            {plan.moves.map((m) => (
              <li key={m.ticker} className="flex items-center gap-2 px-3 py-2">
                <span className={`w-[68px] shrink-0 rounded border px-1.5 py-0.5 text-center text-[11px] ${ACTION[m.action].className}`}>
                  {ACTION[m.action].label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-semibold">{m.ticker}</span>
                  <span className="block truncate text-[11px] text-faint" title={m.name}>{m.name}</span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-sm tabular-nums text-fg">{usd(m.amount)}</span>
                  <span className="block font-mono text-[10px] tabular-nums text-faint">
                    {usd(m.before)} → {usd(m.after)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onApply(plan)}
            className="mt-3 w-full rounded-md bg-accent-strong px-3 py-2 text-sm font-medium text-white hover:bg-accent hover:text-canvas"
          >
            Use these amounts
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Updates the amounts on the left so you can see the result. Nothing is placed with a broker.
          </p>
        </div>
      )}
    </Panel>
  );
}
