"use client";

import { pct } from "@/lib/format";
import { usd, type Plan } from "@/lib/planner";

import AmountInput from "./AmountInput";
import { PLAN_LABEL } from "./MovesPanel";
import { AnimatedNumber, Pane, Segmented, Stepper } from "./ui";

export type MoneyMode = "same" | "add" | "out";

/** One bar: the grey part is how close you are now, the green part what the plan adds. */
function MatchBar({ now, after }: { now: number; after: number }) {
  const lo = Math.max(0, Math.min(1, now));
  const hi = Math.max(lo, Math.min(1, after));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-muted">Target match</span>
        <span className="font-mono text-[14px]">
          <AnimatedNumber value={now} format={(v) => pct(v)} className="text-muted" />
          <span className="mx-1.5 text-faint">→</span>
          <AnimatedNumber value={after} format={(v) => pct(v)} className="text-up" />
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-panel-3">
        <div className="bar-anim absolute inset-y-0 left-0 rounded-full bg-muted/45" style={{ width: `${lo * 100}%` }} />
        <div
          className="bar-anim absolute inset-y-0 rounded-r-full bg-gradient-to-r from-up/50 to-up"
          style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Right column, top: the "execution" panel — money in or out, limits, and the selected plan. */
export default function PlanPanel({
  plans,
  active,
  onActive,
  match,
  total,
  money,
  amount,
  maxNew,
  onMoney,
  onAmount,
  onMaxNew,
  onApply,
  hasTarget,
}: {
  plans: Plan[];
  active: number;
  onActive: (i: number) => void;
  match: number | null;
  total: number;
  money: MoneyMode;
  amount: number;
  maxNew: number;
  onMoney: (m: MoneyMode) => void;
  onAmount: (v: number) => void;
  onMaxNew: (n: number) => void;
  onApply: (plan: Plan) => void;
  hasTarget: boolean;
}) {
  const plan = plans[Math.min(active, plans.length - 1)];
  const quick =
    money === "add"
      ? [500, 1000, 5000].map((v) => ({ label: `$${v.toLocaleString()}`, value: v }))
      : [0.1, 0.25, 0.5].map((f) => ({ label: `${f * 100}%`, value: Math.round(total * f) }));

  return (
    <Pane tabs={[{ id: "plan", label: "Plan" }]} active="plan" className="shrink-0" bodyClassName="p-3.5">
      <Segmented
        label="Money in or out"
        value={money}
        onChange={onMoney}
        options={[
          { value: "same", label: "Same money" },
          { value: "add", label: "Add money" },
          { value: "out", label: "Take out" },
        ]}
      />

      {money !== "same" && (
        <div className="mt-3 animate-fade-up">
          <AmountInput value={amount} onValue={onAmount} label={money === "add" ? "Dollars to add" : "Dollars to take out"} suffix="USD" />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => onAmount(q.value)}
                className={`rounded-md py-1.5 font-mono text-[12px] transition-colors ${amount === q.value ? "bg-panel-3 text-fg" : "bg-canvas text-muted ring-1 ring-line hover:text-fg"}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between rounded-md bg-canvas px-3 py-1.5 ring-1 ring-line">
        <span className="text-[13px] text-fg">New ETFs allowed</span>
        <Stepper value={maxNew} min={0} max={3} onChange={onMaxNew} label="New ETFs allowed" />
      </div>

      {plans.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {plans.map((p, i) => {
            const on = p === plan;
            return (
              <button
                key={p.kind}
                type="button"
                onClick={() => onActive(i)}
                className={`rounded-md px-2.5 py-2 text-left transition-all ${on ? "bg-accent-strong/15 ring-1 ring-accent-strong/60" : "bg-canvas ring-1 ring-line hover:ring-line-2"}`}
              >
                <span className={`block text-[12px] ${on ? "text-fg" : "text-muted"}`}>{PLAN_LABEL[p.kind] ?? p.title}</span>
                <span className="block font-mono text-[13px] text-up">{pct(1 - p.distance)} match</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 space-y-2 rounded-md bg-canvas p-3 ring-1 ring-line">
        {hasTarget && match !== null ? (
          <>
            <MatchBar now={match} after={plan ? 1 - plan.distance : match} />
            {plan && <p className="pt-0.5 text-[11.5px] leading-relaxed text-faint">{plan.summary}</p>}
          </>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {hasTarget ? "Add money above to start from cash." : "Set your target mix and the closest plan appears here."}
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!plan}
        title="Updates your amounts to preview the result. Nothing is placed with a broker."
        onClick={() => plan && onApply(plan)}
        className="group relative mt-3 w-full overflow-hidden rounded-md bg-gradient-to-r from-accent-strong to-[#958ff8] py-3 text-[14px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(122,115,240,0.8)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:from-panel-3 disabled:to-panel-3 disabled:text-faint disabled:shadow-none"
      >
        <span className="relative z-10">{plan ? `Use these amounts · ${usd(plan.total_after)}` : "Use these amounts"}</span>
        <span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/20 opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-100" />
      </button>
    </Pane>
  );
}
