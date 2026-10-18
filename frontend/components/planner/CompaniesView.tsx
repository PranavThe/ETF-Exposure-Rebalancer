"use client";

import { pct } from "@/lib/format";
import { usd, type Companies } from "@/lib/planner";

import { Skeleton } from "./ui";

/** The companies behind your ETFs, each counted once, and how much your funds overlap. */
export default function CompaniesView({ data, loading }: { data: Companies | null; loading: boolean }) {
  if (!data) {
    return loading ? (
      <div className="space-y-3 py-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    ) : (
      <p className="py-16 text-center text-sm text-muted">Add ETFs to see the companies inside them.</p>
    );
  }
  if (data.companies.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">These ETFs don&apos;t list stock holdings we can read.</p>;
  }
  const top = data.companies[0].share || 1;
  const shared = data.companies.filter((c) => c.funds.length > 1).length;
  return (
    <div className="py-1">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pb-4">
        <p className="text-[13.5px] text-fg/90">
          Your 10 biggest companies are <span className="font-mono text-fg">{pct(data.top10_share)}</span> of your money
          {shared > 0 && (
            <span className="text-muted">
              {" "}
              · {shared} of them sit in more than one of your ETFs
            </span>
          )}
          .
        </p>
        {data.overlaps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.overlaps.slice(0, 3).map((o) => (
              <span
                key={`${o.a}-${o.b}`}
                title={`${pct(o.overlap)} of ${o.a} and ${o.b} is in the same companies`}
                className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted"
              >
                {o.a} &amp; {o.b} overlap <span className="text-fg">{pct(o.overlap, 0)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <ol className="divide-y divide-line/50 border-t border-line/60">
        {data.companies.slice(0, 10).map((c, i) => (
          <li
            key={c.ticker ?? c.name}
            className="group grid animate-fade-up grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            <span className="font-mono text-[11px] tabular-nums text-faint">{i + 1}</span>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[13.5px] text-fg/90" title={c.name}>
                {c.name}
              </span>
              {c.ticker && <span className="shrink-0 font-mono text-[11px] text-faint">{c.ticker}</span>}
            </span>
            <span className="text-right font-mono text-[13px] tabular-nums text-fg">
              {pct(c.share)} <span className="hidden text-[11.5px] text-muted sm:inline">{usd(c.amount)}</span>
            </span>
            <span />
            <span className="col-span-2 flex items-center gap-3">
              <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-3">
                <span
                  className="bar-anim absolute inset-y-0 left-0 rounded-full bg-accent/80 transition-colors group-hover:bg-accent"
                  style={{ width: `${(c.share / top) * 100}%` }}
                />
              </span>
              <span className="flex shrink-0 gap-1">
                {c.funds.map((f) => (
                  <span key={f.ticker} title={`${usd(f.amount)} through ${f.ticker}`} className="rounded bg-panel-2 px-1.5 py-px font-mono text-[10.5px] text-muted">
                    {f.ticker}
                  </span>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
        Each company&apos;s dollars added up across your ETFs, from each fund&apos;s latest holdings. Stocks only; cash
        and bonds are left out. Overlap is the share of two funds held in the same companies.
      </p>
    </div>
  );
}
