"use client";

import Link from "next/link";
import { useState } from "react";

import { eventValue } from "@/components/EventList";
import { pct, pp, shortDate } from "@/lib/format";
import type { HoldingChange } from "@/lib/api";
import { terminalHref, type FundOverview } from "@/lib/hooks";
import { EVENT_TYPES, FLAGS, tone } from "@/lib/labels";

import { Corners, FundBadge, SplitBars, SplitChips } from "./bits";
import { eventSplit, ppNum, topHoldings, type FeedEvent, type Featured } from "./derive";

// Indigo glow from the top-left, a fainter one bottom-right, over a near-black base.
const GLOW = {
  background:
    "radial-gradient(90% 120% at 0% 0%, rgb(122 115 240 / 0.42), transparent 60%)," +
    "radial-gradient(70% 90% at 100% 100%, rgb(79 70 229 / 0.28), transparent 65%)," +
    "linear-gradient(135deg, #17142e 0%, #0f0e17 55%, #0c0c10 100%)",
};
const GRID = {
  backgroundImage:
    "linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
  maskImage: "radial-gradient(80% 90% at 30% 20%, black, transparent 75%)",
};

const BUTTON =
  "inline-flex items-center gap-2 rounded-md bg-fg px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-page hover:bg-white";
const TAG =
  "rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/75";

function fullDate(iso: string): string {
  return `${shortDate(iso)}, ${iso.slice(0, 4)}`;
}

function BannerShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate min-h-[360px] overflow-hidden rounded-xl border border-white/10" style={GLOW}>
      <div aria-hidden className="absolute inset-0 -z-10" style={GRID} />
      {children}
    </section>
  );
}

/** The fund with the most events, headlined by its biggest sector drift and that drift's split. */
export function FeaturedBanner({ featured, pending }: { featured: Featured | null; pending?: FundOverview }) {
  if (!featured) return <PendingBanner overview={pending} />;
  const { overview, sector } = featured;
  const c = overview.changes!;
  const from = c.from.as_of_date;
  const to = c.to.as_of_date;
  const sectors = [...c.sectors].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 4);
  const scale = Math.max(...sectors.map((s) => Math.max(Math.abs(s.price_effect), Math.abs(s.activity_effect))), 1e-9);

  return (
    <BannerShell>
      <div className="grid h-full gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_16rem] lg:p-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className={TAG}>Featured comparison</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-white/45">
              {overview.fund.ticker} · {overview.fund.issuer}
            </span>
          </div>

          {sector ? (
            <>
              <h2 className="mt-6 text-4xl font-medium leading-[1.02] tracking-tight sm:text-5xl xl:text-6xl">
                {sector.sector} <span className={`whitespace-nowrap ${tone(sector.drift)}`}>{pp(sector.drift)}</span>
              </h2>
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm bg-price" />
                  <span className="text-white/55">price</span>
                  <span className="text-fg">{pp(sector.price_effect)}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm bg-activity" />
                  <span className="text-white/55">portfolio activity</span>
                  <span className="text-fg">{pp(sector.activity_effect)}</span>
                </span>
              </p>
              <p className="mt-1.5 font-mono text-xs text-white/40">
                Sector weight {pct(sector.w_from)} → {pct(sector.w_to)}
              </p>
            </>
          ) : (
            <h2 className="mt-6 text-4xl font-medium leading-[1.02] tracking-tight sm:text-5xl">{overview.fund.name}</h2>
          )}

          <dl className="mt-6 flex flex-wrap gap-2">
            {[
              ["Holdings", `${c.summary.holdings_from} → ${c.summary.holdings_to}`],
              ["Added", c.summary.added],
              ["Removed", c.summary.removed],
              ["Increased positions", c.summary.increased],
              ["Decreased positions", c.summary.decreased],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/10 bg-black/25 px-3 py-1.5">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
                <dd className="font-mono text-[15px] tabular-nums text-fg">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-8">
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">{overview.fund.name}</div>
              <div className="font-mono text-xs text-white/50">
                {shortDate(from)} → {fullDate(to)} · {c.snapshot_intervals} interval{c.snapshot_intervals === 1 ? "" : "s"} ·{" "}
                {c.events.length} event{c.events.length === 1 ? "" : "s"}
              </div>
            </div>
            <Link href={terminalHref(overview.fund.ticker, from, to)} className={BUTTON}>
              Open in terminal <span aria-hidden>↗</span>
            </Link>
          </div>
        </div>

        <aside className="hidden flex-col rounded-lg border border-white/10 bg-black/35 p-3 backdrop-blur-sm md:flex">
          <div className="flex items-center justify-between">
            <span className="label">Sector drift</span>
            <span className="font-mono text-[10px] text-faint">×{c.flow_factor.toFixed(3)} flow</span>
          </div>
          <ul className="mt-3 flex-1 space-y-4">
            {sectors.map((s) => (
              <li key={s.sector} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-fg/90">{s.sector}</span>
                  <span className={`font-mono tabular-nums ${tone(s.drift)}`}>{pp(s.drift)}</span>
                </div>
                <div className="mb-1 flex justify-between font-mono text-[10px] text-faint">
                  <span>
                    {pct(s.w_from)} → {pct(s.w_to)}
                  </span>
                  <span>
                    <span className="text-accent">P {ppNum(s.price_effect)}</span>{" "}
                    <span className="text-activity">A {ppNum(s.activity_effect)}</span>
                  </span>
                </div>
                <SplitBars price={s.price_effect} activity={s.activity_effect} scale={scale} />
              </li>
            ))}
          </ul>
          <GrossSplit holdings={c.holdings} />
        </aside>
      </div>
    </BannerShell>
  );
}

/** Share of gross weight movement explained by price versus portfolio activity. */
function GrossSplit({ holdings }: { holdings: HoldingChange[] }) {
  let price = 0;
  let activity = 0;
  for (const h of holdings) {
    price += Math.abs(h.price_effect);
    activity += Math.abs(h.activity_effect);
  }
  const total = price + activity;
  const p = total > 1e-12 ? Math.round((price / total) * 100) : 0;
  return (
    <div className="mt-3 border-t border-white/10 pt-2.5" title="Share of gross weight movement across holdings">
      <div className="label mb-1.5">Gross movement</div>
      {total > 1e-12 ? (
        <>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
            <span className="bg-price" style={{ width: `${p}%` }} />
            <span className="flex-1 bg-activity" />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px]">
            <span className="text-accent">price {p}%</span>
            <span className="text-activity">{100 - p}% portfolio activity</span>
          </div>
        </>
      ) : (
        <p className="font-mono text-[10px] text-faint">No weight movement in this range.</p>
      )}
    </div>
  );
}

/** No comparable fund in scope: feature a single-snapshot fund, or explain what's missing. */
function PendingBanner({ overview }: { overview?: FundOverview }) {
  const date = overview?.snapshots[0]?.as_of_date;
  const top = overview ? topHoldings(overview).slice(0, 3) : [];
  return (
    <BannerShell>
      <div className="flex h-full flex-col p-5 sm:p-7 lg:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className={TAG}>Awaiting comparison</span>
          {overview && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-white/45">
              {overview.fund.ticker} · {overview.fund.issuer}
            </span>
          )}
        </div>
        <h2 className="mt-6 max-w-2xl text-4xl font-medium leading-[1.02] tracking-tight sm:text-5xl">
          {overview ? overview.fund.name : "No comparison yet"}
        </h2>
        <p className="mt-4 max-w-xl text-sm text-white/60">
          {overview && date
            ? `One snapshot stored, as of ${fullDate(date)}. Comparison available after the next snapshot.`
            : "A comparison needs two stored snapshots of the same fund."}
        </p>
        {top.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-white/50">
            {top.map(({ row, weight }) => (
              <span key={row.security_id}>
                <span className="text-fg/85">{row.ticker || row.name}</span> {pct(weight)}
              </span>
            ))}
          </p>
        )}
        {overview && (
          <div className="mt-auto pt-8">
            <Link href={`/fund?fund=${overview.fund.ticker}`} className={BUTTON}>
              Open fund profile <span aria-hidden>↗</span>
            </Link>
          </div>
        )}
      </div>
    </BannerShell>
  );
}

const PER_PAGE = 5;
const META = "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint";
const TITLE = "mt-1 block truncate text-sm";
const CHIPS = "mt-1.5 flex gap-1";
const CHIP = "rounded px-1.5 py-0.5 font-mono text-[11px]";

function subjectLabel(item: FeedEvent): string {
  const { overview, event } = item;
  if (event.subject === "portfolio") return `Top-${overview.changes?.summary.top_n ?? ""}`;
  const h = overview.changes?.holdings.find((x) => x.security_id === event.subject);
  return h ? h.ticker || h.name : event.subject;
}

/** Paginated event feed in a bracketed panel, like a live-markets sidebar. */
export function LatestEvents({ feed }: { feed: FeedEvent[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(feed.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const rows = feed.slice(current * PER_PAGE, (current + 1) * PER_PAGE);
  const arrow =
    "flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-panel-3 hover:text-fg disabled:pointer-events-none disabled:opacity-30";

  return (
    <section className="relative flex min-h-[360px] flex-col rounded-xl border border-line bg-panel">
      <Corners />
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative h-2 w-2 rounded-full bg-accent" />
        </span>
        <h2 className="text-[15px] font-semibold tracking-tight">Latest events</h2>
        <span className="font-mono text-xs text-faint">{feed.length}</span>
        <div className="ml-auto flex items-center gap-1 font-mono text-xs text-muted">
          <button type="button" aria-label="Previous page" className={arrow} disabled={current === 0} onClick={() => setPage(current - 1)}>
            ‹
          </button>
          <span className="tabular-nums">
            {current + 1}/{pages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            className={arrow}
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            ›
          </button>
        </div>
      </header>

      {feed.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
          No events yet. Events appear once a fund has two snapshots and a change crosses a threshold.
        </p>
      ) : (
        <ul className="flex-1 divide-y divide-line/70">
          {rows.map((item) => {
            const { overview, event } = item;
            const c = overview.changes!;
            const split = eventSplit(overview, event);
            return (
              <li key={`${overview.fund.ticker}-${event.id}`}>
                <Link
                  href={terminalHref(overview.fund.ticker, c.from.as_of_date, c.to.as_of_date)}
                  title={event.description}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 hover:bg-panel-2"
                >
                  <span className="min-w-0">
                    <span className={META}>
                      <FundBadge ticker={overview.fund.ticker} size="xs" />
                      {overview.fund.ticker} · {shortDate(c.from.as_of_date)} → {shortDate(c.to.as_of_date)}
                    </span>
                    <span className={TITLE}>
                      <span className="font-semibold">{subjectLabel(item)}</span>{" "}
                      <span className="text-muted">{EVENT_TYPES[event.type]?.label ?? event.type}</span>
                    </span>
                    <span className={CHIPS}>
                      {split ? (
                        <SplitChips price={split.price} activity={split.activity} />
                      ) : (
                        <span
                          title={FLAGS.SUSPECTED_CORPORATE_ACTION.title}
                          className={`${CHIP} bg-activity/10 text-activity`}
                        >
                          {FLAGS.SUSPECTED_CORPORATE_ACTION.label}
                        </span>
                      )}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[15px] tabular-nums ${
                      split ? tone(event.magnitude) : "text-activity"
                    }`}
                  >
                    {eventValue(event)}
                  </span>
                </Link>
              </li>
            );
          })}
          {/* Invisible rows pad a short last page so the panel keeps its height. */}
          {Array.from({ length: PER_PAGE - rows.length }, (_, i) => (
            <li key={`pad-${i}`} aria-hidden className="invisible px-4 py-2.5">
              <span className={META}>&nbsp;</span>
              <span className={TITLE}>&nbsp;</span>
              <span className={CHIPS}>
                <span className={CHIP}>&nbsp;</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
