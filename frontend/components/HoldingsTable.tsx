"use client";

import { useEffect, useState } from "react";

import type { HoldingChange } from "@/lib/api";
import { pct, pp, shares, signedPct } from "@/lib/format";
import { FLAGS, STATUS, tone } from "@/lib/labels";

type SortKey = "weight_change" | "price_effect" | "activity_effect" | "security";

const SORTS: Record<SortKey, (h: HoldingChange) => number | string> = {
  weight_change: (h) => -Math.abs(h.w_to - h.w_from),
  price_effect: (h) => -Math.abs(h.price_effect),
  activity_effect: (h) => -Math.abs(h.activity_effect),
  security: (h) => h.ticker || h.name,
};

export function rowId(securityId: string): string {
  return `holding-${securityId}`;
}

export default function HoldingsTable({
  holdings,
  highlighted,
  scrollKey,
  onSelect,
}: {
  holdings: HoldingChange[];
  highlighted: Set<string>;
  scrollKey: string | null;
  onSelect?: (securityId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("weight_change");
  const sortValue = SORTS[sortKey];
  const rows = [...holdings].sort((a, b) => {
    const x = sortValue(a);
    const y = sortValue(b);
    if (x < y) return -1;
    if (x > y) return 1;
    return a.security_id.localeCompare(b.security_id);
  });
  const firstHighlighted = rows.find((h) => highlighted.has(h.security_id))?.security_id;

  // Scroll to the first highlighted row whenever a new selection is made.
  useEffect(() => {
    if (scrollKey && firstHighlighted) {
      document.getElementById(rowId(firstHighlighted))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  function header(key: SortKey, label: string, className = "") {
    const active = sortKey === key;
    return (
      <th className={`px-3 py-2 font-normal ${className}`} aria-sort={active ? "descending" : undefined}>
        <button type="button" onClick={() => setSortKey(key)} className={`uppercase hover:text-fg ${active ? "text-fg" : ""}`}>
          {label}
          {active ? " ↓" : ""}
        </button>
      </th>
    );
  }

  return (
    <table className="w-full whitespace-nowrap text-sm tabular-nums">
      <thead className="label sticky top-0 z-10 bg-panel">
        <tr className="border-b border-line text-right">
          {header("security", "Security", "text-left")}
          <th className="px-3 py-2 text-left font-normal">Status</th>
          <th className="px-3 py-2 font-normal">Weight</th>
          {header("weight_change", "Weight Δ")}
          {header("price_effect", "Price")}
          {header("activity_effect", "Activity")}
          <th className="px-3 py-2 font-normal">Flow-adj. shares</th>
          <th className="px-3 py-2 font-normal">Shares</th>
          <th className="px-3 py-2 text-left font-normal">Sector</th>
          <th className="px-3 py-2 text-left font-normal">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => {
          const isHighlighted = highlighted.has(h.security_id);
          const status = STATUS[h.status];
          return (
            <tr
              key={h.security_id}
              id={rowId(h.security_id)}
              data-highlighted={isHighlighted ? "true" : undefined}
              onClick={() => onSelect?.(h.security_id)}
              className={`cursor-pointer border-b border-line/60 text-right ${
                isHighlighted
                  ? "bg-accent-strong/15 shadow-[inset_2px_0_0_var(--color-accent)]"
                  : "hover:bg-panel-2"
              }`}
            >
              <td className="px-3 py-1.5 text-left">
                <span className="font-medium">{h.ticker || h.name}</span>
                {h.ticker && <span className="ml-2 hidden text-xs text-faint 2xl:inline">{h.name}</span>}
              </td>
              <td className="px-3 py-1.5 text-left">
                <span className={`rounded px-1.5 py-0.5 text-xs ${status.className}`}>{status.label}</span>
              </td>
              <td className="px-3 py-1.5 font-mono text-xs">
                {pct(h.w_from)} → {pct(h.w_to)}
              </td>
              <td className={`px-3 py-1.5 font-mono text-xs font-semibold ${tone(h.w_to - h.w_from)}`}>
                {pp(h.w_to - h.w_from)}
              </td>
              <td className="px-3 py-1.5 font-mono text-xs">{pp(h.price_effect)}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{pp(h.activity_effect)}</td>
              <td className={`px-3 py-1.5 font-mono text-xs ${h.adj_share_change === null ? "text-faint" : tone(h.adj_share_change)}`}>
                {h.adj_share_change === null ? "—" : signedPct(h.adj_share_change)}
              </td>
              <td className="px-3 py-1.5 font-mono text-xs">
                {shares(h.shares_from)} → {shares(h.shares_to)}
              </td>
              <td className="px-3 py-1.5 text-left text-muted">{h.sector}</td>
              <td className="px-3 py-1.5 text-left">
                <span className="flex gap-1">
                  {h.flags.map((f) => (
                    <span key={f} title={FLAGS[f]?.title} className="rounded border border-line-2 px-1.5 py-0.5 text-[11px] text-muted">
                      {FLAGS[f]?.label ?? f}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
