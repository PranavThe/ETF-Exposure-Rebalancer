import type { Fund } from "@/lib/api";

/** The fund list in the terminal sidebar. The selected fund expands to show `children`. */
export default function FundSelector({
  funds,
  value,
  onChange,
  children,
}: {
  funds: Fund[];
  value: string;
  onChange: (ticker: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <ul className="space-y-0.5">
      {funds.map((f) => {
        const selected = f.ticker === value;
        return (
          <li key={f.ticker}>
            <button
              type="button"
              aria-pressed={selected}
              data-fund={f.ticker}
              onClick={() => onChange(f.ticker)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                selected ? "bg-panel-2" : "hover:bg-panel-2/60"
              }`}
            >
              <span className={`text-[10px] text-faint transition-transform ${selected ? "rotate-90" : ""}`}>▶</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{f.ticker}</span>
                <span className="block truncate text-xs text-muted">{f.name}</span>
              </span>
              <span className="font-mono text-[11px] text-faint">{f.snapshot_count}</span>
            </button>
            {selected && children && <div className="mb-2 ml-3 border-l border-line pl-3 pt-1">{children}</div>}
          </li>
        );
      })}
    </ul>
  );
}
