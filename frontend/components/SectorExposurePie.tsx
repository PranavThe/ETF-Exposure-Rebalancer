import { pct } from "@/lib/format";

const COLORS = ["#7a73f0", "#c98500", "#2aaa9a", "#d36a85", "#699ee0", "#a0a64c", "#ac77d4", "#d17f59", "#4fbaa9", "#c2a65e"];

/** Compact sector exposure pie with a readable legend, using fractional weights. */
export default function SectorExposurePie({
  rows,
  title = "Sector exposure",
  description = "Share of covered holdings by sector.",
}: {
  rows: { name: string; weight: number }[];
  title?: string;
  description?: string;
}) {
  const data = rows.filter((row) => row.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = data.reduce((sum, row) => sum + row.weight, 0);
  const stops = data.reduce<{ total: number; values: string[] }>((accumulator, row, index) => {
    const start = accumulator.total;
    const end = start + row.weight / total * 100;
    return { total: end, values: [...accumulator.values, `${COLORS[index % COLORS.length]} ${start}% ${end}%`] };
  }, { total: 0, values: [] }).values;
  return (
    <section className="rounded-md border border-line bg-panel p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted">{description}</p>
      {data.length ? (
        <div className="mt-3 grid items-center gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div className="relative mx-auto h-32 w-32 rounded-full" role="img" aria-label={`${title}: ${data.map((row) => `${row.name} ${pct(row.weight)}`).join(", ")}`} style={{ background: `conic-gradient(${stops.join(", ")})` }}>
            <div aria-hidden className="absolute inset-[28%] rounded-full border border-line bg-panel" />
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs" aria-label={`${title} percentages`}>
            {data.map((row, index) => (
              <li key={row.name} className="flex items-center gap-2">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="font-mono tabular-nums">{pct(row.weight / total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="mt-3 text-sm text-muted">No sector exposure is available.</p>}
    </section>
  );
}
