"use client";

import { useEffect, useState } from "react";

import type { HoldingChange, Status } from "@/lib/api";
import { pct, pp, shares, signedPct } from "@/lib/format";

const STATUS: Record<Status, { label: string; className: string }> = {
  ADDED: { label: "Added", className: "bg-emerald-100 text-emerald-900" },
  REMOVED: { label: "Removed", className: "bg-red-100 text-red-900" },
  INCREASED: { label: "Increased position", className: "bg-blue-100 text-blue-900" },
  DECREASED: { label: "Decreased position", className: "bg-amber-100 text-amber-900" },
  UNCHANGED: { label: "Unchanged", className: "bg-zinc-100 text-zinc-700" },
};

const FLAGS: Record<string, { label: string; title: string }> = {
  SUSPECTED_CORPORATE_ACTION: {
    label: "Suspected split",
    title: "Share count and price moved by offsetting ratios; not counted as portfolio activity.",
  },
  PRICE_ESTIMATED: {
    label: "Price estimated",
    title: "No later price for a removed holding; the counterfactual uses the earlier price.",
  },
  DILUTION: {
    label: "Dilution",
    title: "Share count did not change materially; the weight moved because other positions changed size.",
  },
};

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
}: {
  holdings: HoldingChange[];
  highlighted: Set<string>;
  scrollKey: string | null;
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

  // Scroll to the first highlighted row whenever a new event is selected.
  useEffect(() => {
    if (scrollKey && firstHighlighted) {
      document.getElementById(rowId(firstHighlighted))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  function header(key: SortKey, label: string, className = "") {
    const active = sortKey === key;
    return (
      <th className={`px-2 py-2 font-medium ${className}`} aria-sort={active ? "descending" : undefined}>
        <button
          type="button"
          onClick={() => setSortKey(key)}
          className={`hover:underline ${active ? "text-zinc-900" : ""}`}
        >
          {label}
          {active ? " ▾" : ""}
        </button>
      </th>
    );
  }

  return (
    <section className="min-w-0 rounded border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold">Holdings</h2>
      <p className="mb-2 text-sm text-zinc-600">
        Price effect is the weight change from price movement alone (earlier share counts at later prices).
        Portfolio activity is the rest. Flow-adjusted share change removes the fund-wide scaling from
        creations and redemptions.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b border-zinc-200 text-xs text-zinc-500">
            <tr className="text-right">
              {header("security", "Security", "text-left")}
              <th className="px-2 py-2 text-left font-medium">Sector</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Shares</th>
              <th className="px-2 py-2 font-medium">Flow-adjusted share change</th>
              <th className="px-2 py-2 font-medium">Weight</th>
              {header("weight_change", "Weight change")}
              {header("price_effect", "Price effect")}
              {header("activity_effect", "Portfolio activity")}
              <th className="px-2 py-2 text-left font-medium">Flags</th>
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
                  className={`border-b border-zinc-100 text-right ${
                    isHighlighted ? "bg-yellow-100 outline outline-2 -outline-offset-2 outline-yellow-400" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 text-left">
                    <div className="font-medium">{h.ticker || h.name}</div>
                    {h.ticker && <div className="text-xs text-zinc-500">{h.name}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-left">{h.sector}</td>
                  <td className="px-2 py-1.5 text-left">
                    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {shares(h.shares_from)} → {shares(h.shares_to)}
                  </td>
                  <td className="px-2 py-1.5">
                    {h.adj_share_change === null ? "—" : signedPct(h.adj_share_change)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {pct(h.w_from)} → {pct(h.w_to)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium">{pp(h.w_to - h.w_from)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{pp(h.price_effect)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{pp(h.activity_effect)}</td>
                  <td className="px-2 py-1.5 text-left">
                    <div className="flex flex-wrap gap-1">
                      {h.flags.map((f) => (
                        <span
                          key={f}
                          title={FLAGS[f]?.title}
                          className="whitespace-nowrap rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
                        >
                          {FLAGS[f]?.label ?? f}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
