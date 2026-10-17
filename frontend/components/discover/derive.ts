// Pure helpers that turn fund overviews into the Discover page's lists. Values stay fractions.

import type { CSSProperties } from "react";

import type { ChangeEvent, HoldingChange, HoldingRow, SectorChange } from "@/lib/api";
import { pp } from "@/lib/format";
import type { FundOverview } from "@/lib/hooks";

export type SortKey = "events" | "latest" | "ticker";

export const SORTS: { id: SortKey; label: string }[] = [
  { id: "events", label: "Most events" },
  { id: "latest", label: "Latest snapshot" },
  { id: "ticker", label: "Ticker" },
];

const EPS = 1e-9;

/** A pp value without the unit, for tight chips: 0.078 -> "+7.8". */
export function ppNum(x: number): string {
  return pp(x).replace(" pp", "");
}

export function weightChange(h: HoldingChange): number {
  return h.w_to - h.w_from;
}

export function issuersOf(overviews: FundOverview[]): string[] {
  return [...new Set(overviews.map((o) => o.fund.issuer))].sort();
}

/** The comparison range an overview's changes cover. */
export function rangeLabel(o: FundOverview): { from: string; to: string } | null {
  return o.changes ? { from: o.changes.from.as_of_date, to: o.changes.to.as_of_date } : null;
}

/** Largest sector drift first; on a tie the increase wins. */
function bySectorDrift(a: { m: number }, b: { m: number }): number {
  const d = Math.abs(b.m) - Math.abs(a.m);
  return Math.abs(d) > EPS ? d : b.m - a.m;
}

export type Featured = { overview: FundOverview; sector: SectorChange | null; event: ChangeEvent | null };

/** The fund with the most events over its range, headlined by its biggest sector drift. */
export function featuredOf(overviews: FundOverview[]): Featured | null {
  const comparable = overviews.filter((o) => o.changes);
  if (comparable.length === 0) return null;
  const overview = [...comparable].sort(
    (a, b) => b.changes!.events.length - a.changes!.events.length || b.snapshots.length - a.snapshots.length,
  )[0];
  const changes = overview.changes!;
  const event =
    changes.events
      .filter((e) => e.type === "SECTOR_INCREASE" || e.type === "SECTOR_DECREASE")
      .map((e) => ({ e, m: e.magnitude }))
      .sort(bySectorDrift)[0]?.e ?? null;
  const sector = event
    ? (changes.sectors.find((s) => s.sector === event.subject) ?? null)
    : ([...changes.sectors].map((s) => ({ s, m: s.drift })).sort(bySectorDrift)[0]?.s ?? null);
  return { overview, sector, event };
}

export type FeedEvent = { overview: FundOverview; event: ChangeEvent };

/** Every event, newest comparison first, keeping each fund's own ordering. */
export function eventFeed(overviews: FundOverview[]): FeedEvent[] {
  return overviews
    .filter((o) => o.changes)
    .sort(
      (a, b) =>
        b.changes!.to.as_of_date.localeCompare(a.changes!.to.as_of_date) ||
        a.fund.ticker.localeCompare(b.fund.ticker),
    )
    .flatMap((o) => o.changes!.events.map((event) => ({ overview: o, event })));
}

/** The price / portfolio-activity split behind an event's weight change; null for a share ratio. */
export function eventSplit(o: FundOverview, e: ChangeEvent): { price: number; activity: number } | null {
  const c = o.changes;
  if (!c) return null;
  if (e.type.startsWith("SECTOR_")) {
    const s = c.sectors.find((x) => x.sector === e.subject);
    return s ? { price: s.price_effect, activity: s.activity_effect } : null;
  }
  if (e.type.startsWith("CONCENTRATION_")) {
    const t = c.summary.top_n_share;
    return { price: t.cf - t.from, activity: t.to - t.cf };
  }
  if (e.type.startsWith("POSITION_")) {
    const h = c.holdings.find((x) => x.security_id === (e.contributing_security_ids[0] ?? e.subject));
    return h ? { price: h.price_effect, activity: h.activity_effect } : null;
  }
  return null;
}

export type Mover = { overview: FundOverview; holding: HoldingChange };

/** Holdings with the largest absolute weight change across all comparable funds. */
export function moversOf(overviews: FundOverview[], limit = 12): Mover[] {
  return overviews
    .flatMap((o) => (o.changes?.holdings ?? []).map((holding) => ({ overview: o, holding })))
    .filter((m) => Math.round(Math.abs(weightChange(m.holding)) * 1000) > 0)
    .sort((a, b) => Math.abs(weightChange(b.holding)) - Math.abs(weightChange(a.holding)))
    .slice(0, limit);
}

/** A fund's holding changes ordered by absolute weight change. */
export function topChanges(o: FundOverview): HoldingChange[] {
  return [...(o.changes?.holdings ?? [])].sort((a, b) => Math.abs(weightChange(b)) - Math.abs(weightChange(a)));
}

/** A snapshot's holdings by weight, using the reported weight or else the market-value share. */
export function topHoldings(o: FundOverview): { row: HoldingRow; weight: number }[] {
  const rows = o.holdings?.holdings ?? [];
  const total = rows.reduce((sum, r) => sum + r.market_value, 0);
  return rows
    .map((row) => ({ row, weight: row.reported_weight ?? (total > 0 ? row.market_value / total : 0) }))
    .sort((a, b) => b.weight - a.weight);
}

export function eventCount(o: FundOverview): number {
  return o.changes?.events.length ?? 0;
}

export function sortOverviews(list: FundOverview[], key: SortKey): FundOverview[] {
  const byTicker = (a: FundOverview, b: FundOverview) => a.fund.ticker.localeCompare(b.fund.ticker);
  const latest = (o: FundOverview) => o.fund.latest_as_of_date ?? "";
  return [...list].sort((a, b) => {
    if (key === "events") return eventCount(b) - eventCount(a) || b.snapshots.length - a.snapshots.length || byTicker(a, b);
    if (key === "latest") return latest(b).localeCompare(latest(a)) || byTicker(a, b);
    return byTicker(a, b);
  });
}

/** A stable per-fund tint for its badge. */
const HUES = [248, 165, 38, 340, 205];
export function badgeStyle(ticker: string): CSSProperties {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return {
    background: `linear-gradient(135deg, hsl(${hue} 55% 34%), hsl(${hue + 25} 50% 16%))`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} 60% 60% / 0.25)`,
  };
}
