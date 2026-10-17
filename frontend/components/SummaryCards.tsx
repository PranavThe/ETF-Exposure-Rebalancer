import type { Changes } from "@/lib/api";
import { hhi, pct, pp, signedHhi } from "@/lib/format";

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-200 bg-white px-4 py-3">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SplitCard({
  label,
  value,
  change,
  split,
}: {
  label: string;
  value: string;
  change: string;
  split: string;
}) {
  return (
    <div className="rounded border border-zinc-200 bg-white px-4 py-3 sm:col-span-2">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm">
        <span className="font-medium">{change}</span>{" "}
        <span className="text-zinc-600">{split}</span>
      </div>
    </div>
  );
}

export default function SummaryCards({ changes }: { changes: Changes }) {
  const s = changes.summary;
  const top = s.top_n_share;
  const h = s.hhi;
  return (
    <section className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <CountCard label="Added" value={s.added} />
        <CountCard label="Removed" value={s.removed} />
        <CountCard label="Increased positions" value={s.increased} />
        <CountCard label="Decreased positions" value={s.decreased} />
        <SplitCard
          label={`Top-${s.top_n} share`}
          value={`${pct(top.from)} → ${pct(top.to)}`}
          change={pp(top.to - top.from)}
          split={`(price ${pp(top.cf - top.from)}, portfolio activity ${pp(top.to - top.cf)})`}
        />
        <SplitCard
          label="Concentration (HHI)"
          value={`${hhi(h.from)} → ${hhi(h.to)}`}
          change={signedHhi(h.to - h.from)}
          split={`(price ${signedHhi(h.cf - h.from)}, portfolio activity ${signedHhi(h.to - h.cf)})`}
        />
      </div>
      <p className="text-xs text-zinc-500">
        Equity holdings {s.holdings_from} → {s.holdings_to} · flow factor ×{changes.flow_factor.toFixed(3)}{" "}
        (share-count changes are measured after removing this fund-flow scaling) · cash{" "}
        {pct(changes.cash_weight.from)} → {pct(changes.cash_weight.to)}, excluded from the weights above ·{" "}
        {changes.snapshot_intervals} snapshot interval{changes.snapshot_intervals === 1 ? "" : "s"}
      </p>
    </section>
  );
}
