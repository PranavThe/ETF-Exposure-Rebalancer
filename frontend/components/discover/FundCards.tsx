import Link from "next/link";

import { pct, pp, shortDate } from "@/lib/format";
import { terminalHref, type FundOverview } from "@/lib/hooks";
import { STATUS, tone } from "@/lib/labels";

import { FundBadge, SplitChips } from "./bits";
import { eventCount, topChanges, topHoldings, weightChange } from "./derive";

const ROWS = 4;

/** Where a fund's "Open" goes: the terminal when it can be compared, else its profile. */
export function openHref(o: FundOverview): string {
  const c = o.changes;
  return c ? terminalHref(o.fund.ticker, c.from.as_of_date, c.to.as_of_date) : `/fund?fund=${o.fund.ticker}`;
}

/** Mono footer stats: snapshots, then events or rows, then the dates covered. */
function stats(o: FundOverview): string[] {
  const c = o.changes;
  const out = [`Snapshots ${o.snapshots.length}`];
  if (c) {
    out.push(`Events ${c.events.length}`);
    out.push(`${shortDate(c.from.as_of_date)} → ${shortDate(c.to.as_of_date)}`);
  } else if (o.holdings) {
    out.push(`${o.holdings.holdings.length} rows`, shortDate(o.holdings.snapshot.as_of_date));
  }
  return out;
}

function ChangeRows({ o }: { o: FundOverview }) {
  const rows = topChanges(o);
  const flow = Math.abs(o.changes!.flow_factor - 1) > 1e-6;
  return (
    <>
      <ul className="mt-3 space-y-1">
        {rows.slice(0, ROWS).map((h) => (
          <li
            key={h.security_id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 text-[13px]"
          >
            <span className="truncate" title={h.name}>
              {h.ticker || h.name}{" "}
              <span className="text-faint">{h.status === "UNCHANGED" ? h.sector : STATUS[h.status].label}</span>
            </span>
            <span className={`w-[4.25rem] text-right font-mono font-semibold tabular-nums ${tone(weightChange(h))}`}>
              {pp(weightChange(h))}
            </span>
            <SplitChips price={h.price_effect} activity={h.activity_effect} />
          </li>
        ))}
      </ul>
      {rows.length > ROWS && <div className="mt-1.5 text-xs text-faint">+{rows.length - ROWS} more</div>}
      {flow && (
        <Note dot="bg-price">
          Flow factor ×{o.changes!.flow_factor.toFixed(3)} removed before measuring portfolio activity
        </Note>
      )}
    </>
  );
}

function Note({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <p className="mt-2.5 flex items-center gap-2 rounded border border-dashed border-line-2 px-2 py-1.5 text-xs text-muted">
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </p>
  );
}

function HoldingRows({ o }: { o: FundOverview }) {
  const rows = topHoldings(o);
  return (
    <>
      <ul className="mt-3 space-y-1">
        {rows.slice(0, ROWS).map(({ row, weight }) => (
          <li key={row.security_id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5 text-[13px]">
            <span className="truncate" title={row.name}>
              {row.ticker || row.name} <span className="text-faint">{row.ticker ? row.name : ""}</span>
            </span>
            <span className="w-[4.25rem] text-right font-mono font-semibold tabular-nums">{pct(weight)}</span>
            <span className="w-[6.75rem] truncate rounded bg-panel-3 px-1.5 py-0.5 text-center text-[11px] text-muted">
              {row.sector}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > ROWS && <div className="mt-1.5 text-xs text-faint">+{rows.length - ROWS} more</div>}
      <Note dot="bg-activity">Comparison available after the next snapshot</Note>
    </>
  );
}

export function FundCard({ o }: { o: FundOverview }) {
  const href = openHref(o);
  return (
    <article className="group flex flex-col rounded-lg border border-line bg-panel p-3.5 transition-colors hover:border-line-2">
      <header className="flex items-start gap-3">
        <FundBadge ticker={o.fund.ticker} />
        <div className="min-w-0">
          <Link href={href} className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight hover:underline">
            {o.fund.name}
          </Link>
          <div className="mt-0.5 text-xs text-muted">
            <span className="font-mono">{o.fund.ticker}</span> · {o.fund.issuer}
          </div>
          <div className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] ${o.snapshots.length >= 2 ? "bg-up/10 text-up" : o.snapshots.length === 1 ? "bg-price/10 text-price" : "bg-panel-3 text-faint"}`}>
            {o.snapshots.length >= 2 ? "Comparison ready" : o.snapshots.length === 1 ? "One snapshot · waiting for next" : "No holdings snapshot"}
            {o.fund.latest_as_of_date && <span className="ml-1.5 opacity-80">· latest {shortDate(o.fund.latest_as_of_date)}</span>}
          </div>
        </div>
      </header>

      {o.changes ? (
        <ChangeRows o={o} />
      ) : o.holdings ? (
        <HoldingRows o={o} />
      ) : (
        <p className="mt-3 text-sm text-muted">No snapshot stored yet.</p>
      )}

      <div className="mt-auto pt-3">
        <div className="flex flex-wrap gap-x-2 border-t border-line pt-2.5 font-mono text-[10px] uppercase tracking-wider text-faint">
          {stats(o).map((s, i) => (
            <span key={s}>
              {i > 0 && <span className="mr-2 text-line-2">·</span>}
              {s}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <FundBadge ticker={o.fund.ticker} size="xs" />
            {o.fund.issuer}
          </span>
          <Link href={href} className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-3 hover:text-fg">
            Open <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The list view: one compact row per fund. */
export function FundTable({ list }: { list: FundOverview[] }) {
  const th = "label px-3 py-2 text-left font-normal";
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-panel">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Fund</th>
            <th className={th}>Issuer</th>
            <th className={`${th} text-right`}>Snapshots</th>
            <th className={th}>Range</th>
            <th className={`${th} text-right`}>Events</th>
            <th className={th}>Largest weight change</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {list.map((o) => {
            const top = topChanges(o)[0];
            const holding = top ? null : topHoldings(o)[0];
            const c = o.changes;
            return (
              <tr key={o.fund.ticker} className="border-b border-line/60 last:border-0 hover:bg-panel-2">
                <td className="px-3 py-2">
                  <Link href={openHref(o)} className="flex items-center gap-2.5">
                    <FundBadge ticker={o.fund.ticker} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold">{o.fund.ticker}</span>
                      <span className="block truncate text-xs text-muted">{o.fund.name}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted">{o.fund.issuer}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{o.snapshots.length}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">
                  {c
                    ? `${shortDate(c.from.as_of_date)} → ${shortDate(c.to.as_of_date)}`
                    : o.fund.latest_as_of_date
                      ? shortDate(o.fund.latest_as_of_date)
                      : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{c ? eventCount(o) : "—"}</td>
                <td className="px-3 py-2">
                  {top ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-12 truncate">{top.ticker || top.name}</span>
                      <span className={`w-[4.25rem] text-right font-mono tabular-nums ${tone(weightChange(top))}`}>
                        {pp(weightChange(top))}
                      </span>
                      <SplitChips price={top.price_effect} activity={top.activity_effect} />
                    </span>
                  ) : holding ? (
                    <span className="text-xs text-muted">
                      Top holding <span className="text-fg">{holding.row.ticker || holding.row.name}</span>{" "}
                      <span className="font-mono">{pct(holding.weight)}</span> · comparison after the next snapshot
                    </span>
                  ) : (
                    <span className="text-xs text-faint">No snapshot stored yet</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link href={openHref(o)} className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-panel-3 hover:text-fg">
                    Open <span aria-hidden>↗</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
