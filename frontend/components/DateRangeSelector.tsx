import type { Snapshot } from "@/lib/api";

export type DateRange = { from: string; to: string };

const SELECT = "w-full rounded border border-line bg-panel-2 px-2 py-1 font-mono text-xs text-fg focus:border-line-2 focus:outline-none";

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
    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-x-2 gap-y-1.5">
      <label htmlFor="range-from" className="label">From</label>
      <select id="range-from" className={SELECT} value={value.from} onChange={(e) => changeFrom(e.target.value)}>
        {fromOptions.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <label htmlFor="range-to" className="label">To</label>
      <select
        id="range-to"
        className={SELECT}
        value={value.to}
        onChange={(e) => onChange({ from: value.from, to: e.target.value })}
      >
        {toOptions.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}
