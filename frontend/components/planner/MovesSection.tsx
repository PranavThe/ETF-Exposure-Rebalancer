"use client";

import { useEffect, useRef, useState } from "react";

import { pct } from "@/lib/format";
import { modelLabel, planner, usd, type MoveAction, type Plan, type PlanExplanation, type PlanRequest } from "@/lib/planner";

import { BRAND } from "@/lib/brand";

import { Monogram, SectionHeader, Skeleton, Sparkle, Stepper, TextTabs } from "./ui";

export const PLAN_LABEL: Record<string, string> = {
  rearrange: "Rearrange what you own",
  rearrange_with_new: "Add new ETFs",
};

const ACTION: Record<MoveAction, { label: string; tone: string; pill: string }> = {
  add: { label: "Add", tone: "text-accent", pill: "bg-accent/10 text-accent ring-accent/25" },
  increase: { label: "Increase", tone: "text-up", pill: "bg-up/10 text-up ring-up/25" },
  reduce: { label: "Reduce", tone: "text-down", pill: "bg-down/10 text-down ring-down/25" },
  remove: { label: "Remove", tone: "text-down", pill: "bg-down/10 text-down ring-down/25" },
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
  request,
  dataDates,
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
  request: PlanRequest;
  dataDates: string | null;
  logo?: (ticker: string, name: string) => React.ReactNode;
}) {
  const plan = plans[Math.min(active, plans.length - 1)];
  const [explained, setExplained] = useState<{ key: string; data?: PlanExplanation; error?: string } | null>(null);
  const key = plan ? JSON.stringify([request, plan.kind]) : "";
  const explanation = explained?.key === key ? explained : null;

  function explain() {
    if (!plan) return;
    setExplained({ key });
    planner.explainPlan({ ...request, kind: plan.kind }).then(
      (data) => setExplained((e) => (e?.key === key ? { key, data } : e)),
      (err: Error) => setExplained((e) => (e?.key === key ? { key, error: err.message } : e)),
    );
  }

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
              className="rounded-md bg-accent-strong px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent hover:text-canvas active:scale-[0.98] disabled:bg-panel-3 disabled:text-faint hover:shadow-[0_0_0_4px_rgba(122,115,240,0.18)]"
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
                  <tr key={`${plan.kind}-${m.ticker}-${m.amount}`} className="animate-fade-up border-t border-line/60 transition-colors hover:bg-panel/40" style={{ animationDelay: `${i * 45}ms` }}>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${ACTION[m.action].pill}`}>{ACTION[m.action].label}</span>
                    </td>
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
        {plan && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
            {plan.fee_known_after > 0 && (
              <span title="Yearly fund fees (expense ratios from each fund's SEC filing), for the funds whose fee we have. Transaction costs and taxes aren't included.">
                Yearly fund fees{" "}
                <span className="font-mono text-fg/90">
                  {usd(plan.fee_before)} → {usd(plan.fee_after)}
                </span>
              </span>
            )}
            {!explanation && (
              <button
                type="button"
                onClick={explain}
                className="group inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] text-fg/90 transition-all hover:border-accent-strong/60 hover:bg-accent-strong/10 active:scale-[0.97]"
              >
                <Sparkle className="text-accent transition-transform duration-300 group-hover:rotate-90" /> Why these moves?
              </button>
            )}
          </div>
        )}
        {explanation && <PlanWhy state={explanation} plan={plan} onClose={() => setExplained(null)} />}
        <BeforeYouAct dataDates={dataDates} />
      </div>
    </section>
  );
}

/** Gemini's plain-words reading of the selected plan, from the plan's own numbers. */
function PlanWhy({ state, plan, onClose }: { state: { data?: PlanExplanation; error?: string }; plan: Plan; onClose: () => void }) {
  const actions = new Map(plan.moves.map((m) => [m.ticker, m.action]));
  const box = useRef<HTMLDivElement>(null);
  // The moves area scrolls on its own; bring the explanation into view as it opens and fills in.
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.data, state.error]);
  return (
    <div ref={box} className="mt-4 animate-fade-up rounded-lg border border-line bg-panel/40 p-4">
      <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
        <Sparkle className="text-accent" />
        <span className="font-medium text-fg/90">Why these moves</span>
        <button type="button" onClick={onClose} aria-label="Close explanation" className="ml-auto rounded px-1.5 text-faint transition-colors hover:text-fg">
          ×
        </button>
      </div>
      {state.error ? (
        <p className="text-[13px] text-down">{state.error}</p>
      ) : !state.data ? (
        <div className="space-y-2 py-1">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="space-y-3 text-[13.5px] leading-relaxed text-fg/90">
          <p>{state.data.summary}</p>
          {state.data.moves.length > 0 && (
            <ul className="space-y-1.5">
              {state.data.moves.map((m, i) => {
                const action = actions.get(m.ticker);
                return (
                  <li key={m.ticker} className="flex animate-fade-up gap-2.5" style={{ animationDelay: `${80 + i * 60}ms` }}>
                    <span className={`mt-px shrink-0 font-mono text-[12px] font-semibold ${action ? ACTION[action].tone : "text-muted"}`}>{m.ticker}</span>
                    <span className="text-[13px] text-muted">{m.why}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {state.data.consider.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] text-faint">Worth weighing</p>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted marker:text-faint">
                {state.data.consider.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-faint">
            {state.data.source === "gemini"
              ? `Written by ${modelLabel(state.data.model)} from the plan's numbers. It explains; it doesn't recommend.`
              : "Gemini isn't available right now, so this is a fixed template from the plan's numbers."}
          </p>
        </div>
      )}
    </div>
  );
}

/** The limits of the plan, always one click away. */
function BeforeYouAct({ dataDates }: { dataDates: string | null }) {
  return (
    <details className="group mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] text-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-activity">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        Before you act: what this plan leaves out
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="ml-auto transition-transform group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <ul className="mt-3 grid animate-fade-in gap-x-8 gap-y-2.5 leading-relaxed @[40rem]:grid-cols-2">
        <li>
          <span className="text-fg/90">Math, not advice.</span> {BRAND} doesn&apos;t know your goals, timeline or risk
          tolerance. You choose the target; it only shows how close your ETFs can get.
        </li>
        <li>
          <span className="text-fg/90">Taxes.</span> Reducing a fund in a taxable account can mean tax on gains. Retirement
          accounts work differently. Plans ignore taxes.
        </li>
        <li>
          <span className="text-fg/90">Costs.</span> Yearly fund fees come from each fund&apos;s SEC filing. Spreads and
          commissions when you move money aren&apos;t included.
        </li>
        <li>
          <span className="text-fg/90">Dated data.</span> Holdings come from filings{dataDates ? ` dated ${dataDates}` : ""}.
          Funds change what they hold, so today&apos;s mix can differ.
        </li>
        <li>
          <span className="text-fg/90">Sectors, not companies.</span> A sector match can still lean on a few companies:
          see Companies above.
        </li>
        <li>
          <span className="text-fg/90">AI&apos;s role.</span> Gemini only reads your words and explains the numbers. The
          target is yours, and the moves come from fixed math, never from the model.
        </li>
      </ul>
    </details>
  );
}
