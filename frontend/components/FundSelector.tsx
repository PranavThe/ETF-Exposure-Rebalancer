import type { Fund } from "@/lib/api";

export default function FundSelector({
  funds,
  value,
  onChange,
}: {
  funds: Fund[];
  value: string;
  onChange: (ticker: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-600">Fund</span>
      <select
        className="rounded border border-zinc-300 bg-white px-2 py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {funds.map((f) => (
          <option key={f.ticker} value={f.ticker}>
            {f.ticker} · {f.name} ({f.snapshot_count} snapshot{f.snapshot_count === 1 ? "" : "s"})
          </option>
        ))}
      </select>
    </label>
  );
}
