import { pp } from "@/lib/format";

// Real output of GET /funds/DEMO/changes?from=2026-10-01&to=2026-10-02 (fractions, as the API
// sends them). Technology's portfolio activity is all dilution: none of its share counts moved.
const SECTORS = [
  { sector: "Technology", drift: 0.0, price: 0.05555555555555558, activity: -0.05555555555555558, direct: 0.0, dilution: -0.055555555555555525 },
  { sector: "Health Care", drift: 0.04999999999999999, price: -0.02777777777777779, activity: 0.07777777777777778, direct: 0.07777777777777778, dilution: 0.0 },
  { sector: "Financials", drift: -0.04999999999999999, price: -0.02777777777777779, activity: -0.0222222222222222, direct: -0.0222222222222222, dilution: 0.0 },
];

const DOMAIN = 0.1; // ±10 pp either side of zero
const TICKS = [-0.1, -0.05, 0, 0.05, 0.1];

function Bar({ value, kind }: { value: number; kind: "price" | "activity" }) {
  const width = `${(Math.abs(value) / DOMAIN) * 50}%`;
  const color = kind === "price" ? "bg-price" : "bg-activity";
  return (
    <div className="relative h-3">
      <div
        className={`absolute inset-y-0 ${color} ${value >= 0 ? "rounded-r-[2px]" : "rounded-l-[2px]"}`}
        style={value >= 0 ? { left: "50%", width } : { right: "50%", width }}
      />
    </div>
  );
}

function Grid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {TICKS.map((t) => (
        <div
          key={t}
          className={`absolute inset-y-0 w-px ${t === 0 ? "bg-line-2" : "bg-line/60"}`}
          style={{ left: `${50 + (t / DOMAIN) * 50}%` }}
        />
      ))}
    </div>
  );
}

export default function SectorBars() {
  return (
    <figure className="mx-auto w-full max-w-[640px] rounded-[10px] border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <span className="text-[13px] text-fg">Sector drift, split</span>
        <span className="label">DEMO fund, Oct 1 → Oct 2</span>
      </div>

      <div className="px-4 pt-5 pb-4 sm:px-5">
        <ul className="space-y-6">
          {SECTORS.map((s) => (
            <li key={s.sector} className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_5.25rem] sm:items-center">
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <div className="text-[14px] text-fg">{s.sector}</div>
                <div className="font-mono text-[11px] text-faint sm:mt-0.5">net {pp(s.drift)}</div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_5.25rem] items-center gap-x-3 sm:contents">
                <div className="relative space-y-1.5 py-1">
                  <Grid />
                  <Bar value={s.price} kind="price" />
                  <Bar value={s.activity} kind="activity" />
                </div>
                <div className="space-y-1.5 text-right font-mono text-[11px] leading-3 tabular-nums">
                  <div className="text-price">{pp(s.price)}</div>
                  <div className="text-activity">
                    {pp(s.activity)}
                    {s.direct === 0 && s.dilution !== 0 && <span className="sr-only"> (all dilution)</span>}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Axis ticks, aligned under the bar column. */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_5.25rem] gap-x-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_5.25rem] sm:gap-x-4">
          <div className="hidden sm:block" />
          <div className="relative h-4 font-mono text-[10px] text-faint">
            {TICKS.map((t) => (
              <span
                key={t}
                className={`absolute top-0 ${t === TICKS[0] ? "" : t === TICKS[TICKS.length - 1] ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${50 + (t / DOMAIN) * 50}%` }}
              >
                {t === 0 ? "0" : `${t > 0 ? "+" : "−"}${Math.abs(t * 100)}`}
              </span>
            ))}
          </div>
          <div className="text-right font-mono text-[10px] text-faint">pp</div>
        </div>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-price" />
          Price effect
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-activity" />
          Portfolio activity
        </span>
        <span className="text-faint sm:ml-auto">Technology: net 0.0 pp, all of its activity is dilution</span>
      </figcaption>
    </figure>
  );
}
