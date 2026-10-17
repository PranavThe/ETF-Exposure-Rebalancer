"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { HoldingChange } from "@/lib/api";
import { pct, pp, shares, shortDate, signedPct } from "@/lib/format";
import { type RangeKind, terminalHref, useFunds, useOverviews, useQueryState } from "@/lib/hooks";
import { STATUS, tone } from "@/lib/labels";

import { ArcLines, Avatar, EmptyState, Segmented, initials } from "../fund/kit";
import Notice from "../ui/Notice";

type Mover = { fund: string; from: string; to: string; change: HoldingChange; rank: number };

// Column templates: mobile shows rank, security and activity; md adds fund and weight; lg shows all.
const GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[2.5rem_minmax(0,1fr)_6rem_9.75rem_minmax(0,12.5rem)] lg:grid-cols-[2.5rem_minmax(0,1fr)_6rem_9.5rem_10rem_minmax(0,13.5rem)_7.5rem]";

function Header() {
  return (
    <div className={`${GRID} h-10 border-b border-line px-4`}>
      <span className="label">Rank</span>
      <span className="label">Security</span>
      <span className="label hidden md:block">Fund</span>
      <span className="label hidden lg:block">Status</span>
      <span className="label text-right whitespace-nowrap text-fg">↓ Portfolio activity</span>
      <span className="label hidden text-right md:block">Weight</span>
      <span className="label hidden text-right lg:block">Flow-adj. shares</span>
    </div>
  );
}

function Row({ m }: { m: Mover }) {
  const h = m.change;
  const status = STATUS[h.status];
  const drift = h.w_to - h.w_from;
  return (
    <Link
      href={terminalHref(m.fund, m.from, m.to)}
      className={`${GRID} min-h-16 border-b border-line/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-panel-2/80`}
      title={`Open ${m.fund} ${m.from} → ${m.to} in the terminal`}
    >
      <span className="font-mono text-sm text-faint tabular-nums">{m.rank}</span>

      <span className="flex min-w-0 items-center gap-3">
        <Avatar seed={m.fund} text={initials(h.ticker, h.name)} size={36} badge={m.fund} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{h.ticker || h.security_id}</span>
          <span className="block truncate text-xs text-muted">{h.name}</span>
          <span className="mt-1 flex items-center gap-1.5 lg:hidden">
            <span className={`rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap ${status.className}`}>{status.label}</span>
            <span className="font-mono text-[10px] text-faint md:hidden">{m.fund}</span>
          </span>
        </span>
      </span>

      <span className="hidden min-w-0 md:block">
        <span className="block font-mono text-[13px]">{m.fund}</span>
        <span className="block truncate font-mono text-[11px] text-faint">
          {shortDate(m.from)} → {shortDate(m.to)}
        </span>
      </span>

      <span className="hidden lg:block">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${status.className}`}>{status.label}</span>
      </span>

      <span className="text-right">
        <span className={`block font-mono text-[15px] font-semibold tabular-nums ${tone(h.activity_effect)}`}>
          {pp(h.activity_effect)}
        </span>
      </span>

      <span className="hidden min-w-0 text-right md:block">
        <span className="block truncate font-mono text-[13px] tabular-nums">
          {pct(h.w_from)} → {pct(h.w_to)}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted tabular-nums">
          <span className={tone(drift)}>{pp(drift)}</span> · <span className="text-price">price</span> {pp(h.price_effect)}
        </span>
      </span>

      <span className="hidden text-right lg:block">
        <span className={`block font-mono text-[13px] tabular-nums ${h.adj_share_change === null ? "text-faint" : tone(h.adj_share_change)}`}>
          {h.adj_share_change === null ? "—" : signedPct(h.adj_share_change)}
        </span>
        <span className="block truncate font-mono text-[11px] text-faint tabular-nums">
          {shares(h.shares_from)} → {shares(h.shares_to)}
        </span>
      </span>

      <span className="col-span-2 col-start-2 mt-2 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-muted tabular-nums md:hidden">
        <span>
          weight {pct(h.w_from)} → {pct(h.w_to)}
        </span>
        <span>
          <span className={tone(drift)}>{pp(drift)}</span> · <span className="text-price">price</span> {pp(h.price_effect)}
        </span>
      </span>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`${GRID} min-h-16 border-b border-line/60 px-4 py-3`}>
          <span className="h-3 w-4 animate-pulse rounded bg-panel-2" />
          <span className="flex items-center gap-3">
            <span className="h-9 w-9 animate-pulse rounded-full bg-panel-2" />
            <span className="h-3 w-24 animate-pulse rounded bg-panel-2" />
          </span>
          <span className="ml-auto h-3 w-14 animate-pulse rounded bg-panel-2" />
        </div>
      ))}
    </div>
  );
}

/** Positions whose flow-adjusted share counts changed, across funds, ranked by |portfolio activity|. */
export default function MoversBoard() {
  const query = useQueryState();
  const range: RangeKind = query.get("range") === "latest" ? "latest" : "full";
  const fundParam = query.get("fund")?.toUpperCase();
  const [search, setSearch] = useState(() => query.get("q") ?? "");

  const funds = useFunds();
  const fundList = funds.data ?? [];
  const overviews = useOverviews(range);
  const selected = fundList.find((f) => f.ticker === fundParam);
  const fundFilter = selected?.ticker ?? "ALL";

  const all = useMemo(() => {
    const out: Omit<Mover, "rank">[] = [];
    for (const o of overviews.data ?? []) {
      if (!o.changes) continue;
      for (const change of o.changes.holdings) {
        if (change.traded) {
          out.push({ fund: o.fund.ticker, from: o.changes.from.as_of_date, to: o.changes.to.as_of_date, change });
        }
      }
    }
    return out.sort((a, b) => Math.abs(b.change.activity_effect) - Math.abs(a.change.activity_effect));
  }, [overviews.data]);

  const ranked: Mover[] = all
    .filter((m) => fundFilter === "ALL" || m.fund === fundFilter)
    .map((m, i) => ({ ...m, rank: i + 1 }));
  const q = search.trim().toLowerCase();
  const visible = q
    ? ranked.filter(
        (m) =>
          m.change.ticker.toLowerCase().includes(q) ||
          m.change.name.toLowerCase().includes(q) ||
          m.fund.toLowerCase().includes(q),
      )
    : ranked;
  const fundsShown = new Set(visible.map((m) => m.fund)).size;

  function updateSearch(value: string) {
    setSearch(value);
    query.set({ q: value.trim() || undefined });
  }

  const fundOptions = [
    { value: "ALL", label: "All funds" },
    ...fundList.map((f) => ({
      value: f.ticker,
      label: f.ticker,
      disabled: f.snapshot_count < 2,
      title:
        f.snapshot_count < 2
          ? `${f.ticker} has ${f.snapshot_count} snapshot${f.snapshot_count === 1 ? "" : "s"}; ranking needs at least two to compare`
          : f.name,
    })),
  ];

  const profileFund = selected?.ticker ?? "DEMO";
  const loading = overviews.loading || funds.loading;
  const error = overviews.error ?? funds.error;

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="p-4">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  } else if (loading) {
    body = <SkeletonRows />;
  } else if (selected && selected.snapshot_count < 2) {
    body = (
      <EmptyState title={`${selected.ticker} has only one snapshot`}>
        Movers compare two snapshots, so there is nothing to rank yet.{" "}
        <Link href={`/fund?fund=${selected.ticker}`} className="text-accent hover:underline">
          See its holdings in the fund profile
        </Link>
        .
      </EmptyState>
    );
  } else if (ranked.length === 0) {
    body = (
      <EmptyState
        title={`No position${selected ? ` in ${selected.ticker}` : ""} changed size in this range`}
      >
        <p>
          {range === "latest"
            ? `Between ${selected ? `${selected.ticker}'s` : "each fund's"} two most recent snapshots, no flow-adjusted share count changed enough to count as portfolio activity. Weights may still have moved with prices.`
            : "No flow-adjusted share count changed enough to count as portfolio activity. Weights may still have moved with prices; suspected splits are flagged, not counted."}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {range === "latest" && (
            <button
              type="button"
              onClick={() => query.set({ range: undefined })}
              className="rounded-md border border-accent/40 bg-accent-strong/20 px-3 py-1.5 text-sm text-fg hover:bg-accent-strong/30"
            >
              Switch to Full history
            </button>
          )}
          {selected && (
            <Link
              href={terminalHref(selected.ticker)}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              Open {selected.ticker} in terminal
            </Link>
          )}
        </div>
      </EmptyState>
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState title={`No movers match “${search.trim()}”`}>
        <button type="button" onClick={() => updateSearch("")} className="text-accent hover:underline">
          Clear search
        </button>
      </EmptyState>
    );
  } else {
    body = visible.map((m) => <Row key={`${m.fund}:${m.change.security_id}`} m={m} />);
  }

  return (
    <div className="relative isolate min-h-full">
      <ArcLines />
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pt-6 pb-12 md:px-6 md:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">Movers</h1>
            <p className="mt-1 text-sm text-muted">
              Positions whose share counts changed the most between snapshots, ranked by portfolio activity.
            </p>
          </div>
          <Link
            href={`/fund?fund=${profileFund}`}
            className="mt-1 hidden shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:text-fg sm:flex"
          >
            <Avatar seed={profileFund} text={profileFund.slice(0, 1)} size={22} />
            {profileFund} profile →
          </Link>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 lg:flex-1">
            <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute top-1/2 left-3 -translate-y-1/2 text-faint">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => updateSearch(e.target.value)}
              placeholder="Search by ticker or name"
              aria-label="Search by ticker or name"
              className="h-9 w-full rounded-md border border-line bg-panel pr-3 pl-9 text-sm placeholder:text-faint focus:border-line-2 focus:outline-none"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Segmented
              label="Fund"
              options={fundOptions}
              value={fundFilter}
              onChange={(v) => query.set({ fund: v === "ALL" ? undefined : v })}
            />
            <Segmented
              label="Range"
              options={[
                { value: "full", label: "Full history", title: "First snapshot to latest, per fund" },
                { value: "latest", label: "Latest interval", title: "The two most recent snapshots, per fund" },
              ]}
              value={range}
              onChange={(v) => query.set({ range: v === "latest" ? "latest" : undefined })}
            />
          </div>
        </div>

        <section className="overflow-hidden rounded-md border border-line bg-panel">
          <Header />
          {body}
        </section>

        <div className="flex flex-col gap-1 text-xs text-faint sm:flex-row sm:justify-between">
          <span>
            Portfolio activity is the part of a weight change explained by flow-adjusted share-count changes; the
            price part is shown next to each weight change.
          </span>
          {!loading && visible.length > 0 && (
            <span className="shrink-0 font-mono">
              {visible.length} position{visible.length === 1 ? "" : "s"} · {fundsShown} fund{fundsShown === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
