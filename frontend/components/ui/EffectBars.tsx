import { pp } from "@/lib/format";

/** Two diverging bars from a shared zero line: the price effect and the portfolio-activity effect. */
export default function EffectBars({ price, activity }: { price: number; activity: number }) {
  const scale = Math.max(Math.abs(price), Math.abs(activity), 1e-9);
  const rows = [
    { label: "Price", value: price, color: "bg-price" },
    { label: "Portfolio activity", value: activity, color: "bg-activity" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const width = `${(Math.abs(r.value) / scale) * 50}%`;
        return (
          <div key={r.label} className="text-xs">
            <div className="mb-1 flex justify-between">
              <span className="text-muted">{r.label}</span>
              <span className="font-mono tabular-nums">{pp(r.value)}</span>
            </div>
            <div className="relative h-2 rounded-sm bg-panel-3">
              <div className="absolute -inset-y-0.5 left-1/2 w-px bg-line-2" />
              <div
                className={`absolute inset-y-0 rounded-sm ${r.color}`}
                style={r.value >= 0 ? { left: "50%", width } : { right: "50%", width }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
