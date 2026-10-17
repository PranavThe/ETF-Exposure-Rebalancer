import type { Snapshot } from "@/lib/api";

export type DateRange = { from: string; to: string };

/** Offers only dates that have a stored snapshot; "to" is always later than "from". */
export default function DateRangeSelector({
  snapshots,
  value,
  onChange,
}: {
  snapshots: Snapshot[];
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const dates = snapshots.map((s) => s.as_of_date);
  const fromOptions = dates.slice(0, -1);
  const toOptions = dates.filter((d) => d > value.from);

  function changeFrom(from: string) {
    const to = value.to > from ? value.to : dates[dates.indexOf(from) + 1];
    onChange({ from, to });
  }

  return (
    <div className="flex items-end gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-zinc-600">From</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1.5"
          value={value.from}
          onChange={(e) => changeFrom(e.target.value)}
        >
          {fromOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <span className="pb-2 text-zinc-400">→</span>
      <label className="flex flex-col gap-1">
        <span className="font-medium text-zinc-600">To</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1.5"
          value={value.to}
          onChange={(e) => onChange({ from: value.from, to: e.target.value })}
        >
          {toOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
