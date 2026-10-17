import Link from "next/link";

import type { Changes, Holdings } from "@/lib/api";
import { pct, shortDate } from "@/lib/format";
import { terminalHref } from "@/lib/hooks";

import { Card, CardHeader } from "./kit";

function Cell({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0 rounded border border-line bg-panel-2/60 px-3 py-2.5">
      <div className="label leading-tight">{label}</div>
      <div className={`mt-1 truncate font-mono text-[16px] tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function Headline({ value, caption }: { value: React.ReactNode; caption: string }) {
  return (
    <div>
      <div className="text-[40px] leading-none font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 text-sm text-muted">{caption}</div>
    </div>
  );
}

/** Thin two-part bar with captions under each end. */
function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
  leftClass,
  rightClass,
  leftBar,
  rightBar,
  title,
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  leftClass: string;
  rightClass: string;
  leftBar: string;
  rightBar: string;
  title: string;
}) {
  const total = left + right;
  const share = total > 0 ? (left / total) * 100 : 0;
  return (
    <div title={title}>
      <div className="flex h-1 overflow-hidden rounded-full bg-panel-3">
        {total > 0 && (
          <>
            <span className={leftBar} style={{ width: `${share}%` }} />
            <span className={`flex-1 ${rightBar}`} />
          </>
        )}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px]">
        <span className={leftClass}>{leftLabel}</span>
        <span className={rightClass}>{rightLabel}</span>
      </div>
    </div>
  );
}

function ComparisonMetrics({ changes }: { changes: Changes }) {
  const s = changes.summary;
  let price = 0;
  let activity = 0;
  for (const h of changes.holdings) {
    price += Math.abs(h.price_effect);
    activity += Math.abs(h.activity_effect);
  }
  const total = price + activity;
  const p = total > 1e-12 ? Math.round((price / total) * 100) : 0;
  const from = changes.from.as_of_date;
  const to = changes.to.as_of_date;
  const n = changes.events.length;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <Headline value={n} caption={`event${n === 1 ? "" : "s"}, ${shortDate(from)} → ${shortDate(to)}`} />
      {total > 1e-12 ? (
        <SplitBar
          left={price}
          right={activity}
          leftLabel={`price ${p}%`}
          rightLabel={`${100 - p}% portfolio activity`}
          leftClass="text-price"
          rightClass="text-activity"
          leftBar="bg-price"
          rightBar="bg-activity"
          title="Share of gross weight movement explained by price versus portfolio activity"
        />
      ) : (
        <p className="text-xs text-faint">No weight movement in this range.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Added" value={s.added} className={s.added ? "text-up" : "text-faint"} />
        <Cell label="Removed" value={s.removed} className={s.removed ? "text-down" : "text-faint"} />
        <Cell label="Increased positions" value={s.increased} className={s.increased ? "text-up" : "text-faint"} />
        <Cell label="Decreased positions" value={s.decreased} className={s.decreased ? "text-down" : "text-faint"} />
        <Cell label="Flow factor" value={`×${changes.flow_factor.toFixed(3)}`} />
        <Cell label="Snapshot intervals" value={changes.snapshot_intervals} />
      </div>
      <Link
        href={terminalHref(changes.fund, from, to)}
        className="mt-auto inline-flex items-center gap-1 self-start text-sm text-accent hover:underline"
      >
        Open {shortDate(from)} → {shortDate(to)} in terminal →
      </Link>
    </div>
  );
}

function SnapshotMetrics({ holdings }: { holdings: Holdings }) {
  const rows = holdings.holdings;
  const equity = rows.filter((h) => h.asset_class === "equity");
  const cash = rows.filter((h) => h.asset_class === "cash");
  const other = rows.length - equity.length - cash.length;
  const weightOf = (list: typeof rows) => list.reduce((sum, h) => sum + (h.reported_weight ?? 0), 0);
  const eqWeight = weightOf(equity);
  const restWeight = weightOf(rows) - eqWeight;
  const largest = rows.reduce<(typeof rows)[number] | null>(
    (best, h) => ((h.reported_weight ?? -1) > (best?.reported_weight ?? -1) ? h : best),
    null,
  );
  const date = holdings.snapshot.as_of_date;
  const hasWeights = rows.some((h) => h.reported_weight !== null);

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <Headline value={equity.length} caption={`equity holdings, ${shortDate(date)}`} />
      {hasWeights && (
        <SplitBar
          left={eqWeight}
          right={restWeight}
          leftLabel={`equity ${pct(eqWeight)}`}
          rightLabel={`${pct(restWeight)} cash & other`}
          leftClass="text-accent"
          rightClass="text-faint"
          leftBar="bg-accent-strong"
          rightBar="bg-line-2"
          title="Reported weight by asset class"
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Rows" value={rows.length} />
        <Cell label="Cash rows" value={cash.length} className={cash.length ? "" : "text-faint"} />
        <Cell label="Other rows" value={other} className={other ? "" : "text-faint"} />
        <Cell
          label="Largest holding"
          value={
            largest && largest.reported_weight !== null ? (
              <span title={largest.name}>
                {largest.ticker || largest.security_id}{" "}
                <span className="text-muted">{pct(largest.reported_weight)}</span>
              </span>
            ) : (
              "—"
            )
          }
        />
      </div>
      <div className="mt-auto rounded border border-dashed border-line-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
        A comparison needs a second snapshot. Ingest this fund&apos;s holdings file from another date to see
        added, removed and resized positions.
      </div>
    </div>
  );
}

export default function MetricsPanel({
  changes,
  holdings,
  snapshotCount,
  error,
}: {
  changes?: Changes;
  holdings?: Holdings;
  snapshotCount: number | undefined;
  error?: string;
}) {
  const range = changes ? `${shortDate(changes.from.as_of_date)} → ${shortDate(changes.to.as_of_date)}` : null;
  return (
    <Card>
      <CardHeader right={range && <span className="font-mono text-[11px] text-faint">{range}</span>}>
        <span className="label">Metrics</span>
      </CardHeader>
      {error ? (
        <p className="p-4 text-sm text-down">{error}</p>
      ) : snapshotCount !== undefined && snapshotCount >= 2 && changes ? (
        <ComparisonMetrics changes={changes} />
      ) : snapshotCount === 1 && holdings ? (
        <SnapshotMetrics holdings={holdings} />
      ) : snapshotCount === 0 ? (
        <p className="p-4 text-sm text-muted">No snapshots stored for this fund yet.</p>
      ) : (
        <div className="space-y-3 p-4" aria-busy>
          <div className="h-10 w-16 animate-pulse rounded bg-panel-2" />
          <div className="h-3 w-40 animate-pulse rounded bg-panel-2" />
          <div className="h-1 animate-pulse rounded bg-panel-2" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-14 animate-pulse rounded bg-panel-2" />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
