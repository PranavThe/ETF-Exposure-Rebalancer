import type { Changes } from "@/lib/api";
import { hhi, pct, pp, signedHhi } from "@/lib/format";

import EffectBars from "./ui/EffectBars";

function Count({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-semibold ${value ? className : "text-faint"}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

/** The comparison at a glance: position counts, concentration with its price/activity split, context. */
export default function SummaryCards({ changes }: { changes: Changes }) {
  const s = changes.summary;
  const top = s.top_n_share;
  const h = s.hhi;
  return (
    <div className="space-y-4 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Count label="Added" value={s.added} className="text-up" />
        <Count label="Removed" value={s.removed} className="text-down" />
        <Count label="Increased positions" value={s.increased} className="text-up" />
        <Count label="Decreased positions" value={s.decreased} className="text-down" />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="label">Top-{s.top_n} share</span>
          <span className="font-mono text-xs text-muted">
            {pct(top.from)} → {pct(top.to)}
          </span>
        </div>
        <div className="text-xl font-semibold">{pp(top.to - top.from)}</div>
        <EffectBars price={top.cf - top.from} activity={top.to - top.cf} />
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="label">Concentration (HHI)</span>
          <span className="font-mono text-xs text-muted">
            {hhi(h.from)} → {hhi(h.to)}
          </span>
        </div>
        <div className="text-xl font-semibold">{signedHhi(h.to - h.from)}</div>
        <div className="text-xs text-muted">
          price {signedHhi(h.cf - h.from)} · portfolio activity {signedHhi(h.to - h.cf)}
        </div>
      </div>

      <div className="divide-y divide-line border-t border-line">
        <Row label="Equity holdings" value={`${s.holdings_from} → ${s.holdings_to}`} />
        <Row label="Flow factor" value={`×${changes.flow_factor.toFixed(3)}`} />
        <Row label="Cash weight" value={`${pct(changes.cash_weight.from)} → ${pct(changes.cash_weight.to)}`} />
        <Row label="Snapshot intervals" value={changes.snapshot_intervals} />
      </div>
      <p className="text-xs leading-relaxed text-faint">
        Share-count changes are measured after removing the flow factor (creations and redemptions). Cash
        is excluded from all weights.
      </p>
    </div>
  );
}
