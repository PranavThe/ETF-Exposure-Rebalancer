"use client";

import { useState } from "react";

import type { Changes, Fund, Holdings, Snapshot } from "@/lib/api";
import { hhi, pct } from "@/lib/format";

import { Avatar, longDate } from "./kit";

function Stat({
  label,
  value,
  hint,
  mono = true,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 px-4 py-3 ${className}`}>
      <div className="label truncate">{label}</div>
      <div className={`mt-1.5 truncate text-[15px] text-fg tabular-nums ${mono ? "font-mono" : "font-medium"}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be unavailable (insecure context); nothing else to do.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy a link to this profile"
      aria-label="Copy a link to this profile"
      className="flex h-6 items-center gap-1 rounded px-1 text-faint hover:bg-panel-2 hover:text-fg"
    >
      {copied ? (
        <span className="font-mono text-[11px] text-up">Copied</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" />
          <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" stroke="currentColor" />
        </svg>
      )}
    </button>
  );
}

/** Fund identity and snapshot facts in one strip, concentration in a box on the right. */
export default function StatStrip({
  fund,
  snapshots,
  latestHoldings,
  changes,
}: {
  fund: Fund;
  snapshots: Snapshot[] | undefined;
  latestHoldings: Holdings | undefined;
  changes: Changes | undefined;
}) {
  const first = snapshots?.[0];
  const last = snapshots?.[snapshots.length - 1];
  const equity = latestHoldings?.holdings.filter((h) => h.asset_class === "equity").length;
  const single = snapshots !== undefined && snapshots.length < 2;
  const s = changes?.summary;
  const dash = <span className="text-faint">—</span>;
  const pendingHint = single ? "needs 2 snapshots" : undefined;

  return (
    <div className="flex flex-col gap-3 xl:flex-row">
      <section className="min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-panel">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:flex xl:divide-x xl:divide-line">
          <div className="col-span-2 flex min-w-0 items-center gap-3 border-b border-line px-4 py-3 sm:col-span-3 xl:w-[300px] xl:shrink-0 xl:border-b-0">
            <Avatar seed={fund.ticker} text={fund.ticker.slice(0, 2)} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[15px] font-semibold tracking-tight">{fund.ticker}</span>
                <CopyLink />
              </div>
              <div className="truncate text-xs text-muted">{fund.name}</div>
            </div>
          </div>
          <Stat label="Issuer" value={fund.issuer} mono={false} className="xl:flex-1" />
          <Stat label="Snapshots" value={snapshots?.length ?? fund.snapshot_count} className="xl:flex-1" />
          <Stat label="First" value={first ? longDate(first.as_of_date) : dash} mono={false} className="xl:flex-1" />
          <Stat label="Latest" value={last ? longDate(last.as_of_date) : dash} mono={false} className="xl:flex-1" />
          <Stat label="Rows" value={last?.row_count ?? dash} hint="latest snapshot" className="xl:flex-1" />
          <Stat label="Holdings" value={equity ?? dash} hint="equity rows, latest" className="xl:flex-1" />
        </div>
      </section>
      <section className="grid shrink-0 grid-cols-2 divide-x divide-line overflow-hidden rounded-md border border-line bg-panel xl:w-[300px]">
        <Stat
          label={s ? `Top-${s.top_n} share` : "Top-N share"}
          value={s ? pct(s.top_n_share.to) : dash}
          hint={s && last ? `as of ${longDate(last.as_of_date)}` : pendingHint}
        />
        <Stat
          label="HHI"
          value={s ? hhi(s.hhi.to) : dash}
          hint={s ? "equity weights" : pendingHint}
        />
      </section>
    </div>
  );
}
