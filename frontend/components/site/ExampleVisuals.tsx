// Product visuals for the landing page, drawn in HTML and CSS (no screenshots).
//
// One example runs through all three: IVV $6,000, IYW $3,000 and ARKK $1,000, with the target
// "less tech, more health care" (Technology −5.0 pp, Health Care +5.0 pp). The numbers are the
// planner's real output on the iShares and ARK holdings files of Oct 15–16, 2026. They are kept
// as fractions, like the API sends them, and only the helpers below turn them into % or pp.

const MINUS = "−";

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function pp(x: number): string {
  const v = Math.round(x * 1000) / 10;
  if (v === 0) return "0.0 pp";
  return `${v < 0 ? MINUS : "+"}${Math.abs(v).toFixed(1)} pp`;
}

/** An unsigned distance in percentage points: 0.004 -> "0.4 pp". */
function ppLevel(x: number): string {
  return `${(x * 100).toFixed(1)} pp`;
}

function dollars(x: number): string {
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

const EXAMPLE_NOTE = "Example";

/** The shared frame: a panel with a title bar, like the app's own panels. */
function Panel({
  title,
  children,
  caption,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <figure className="mx-auto w-full max-w-[600px] overflow-hidden rounded-[10px] border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <span className="text-[13px] text-fg">{title}</span>
        <span className="label">{EXAMPLE_NOTE}</span>
      </div>
      {children}
      {caption && (
        <figcaption className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted sm:px-5">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Look-through: three ETFs opened up and blended into one sector mix.

const ETFS = [
  {
    ticker: "IVV",
    amount: 6000,
    inside: [
      ["Technology", 0.3828],
      ["Financials", 0.1163],
      ["Communication Services", 0.0982],
    ],
  },
  {
    ticker: "IYW",
    amount: 3000,
    inside: [
      ["Technology", 0.9034],
      ["Communication Services", 0.0875],
    ],
  },
  {
    ticker: "ARKK",
    amount: 1000,
    inside: [
      ["Health Care", 0.2629],
      ["Technology", 0.2486],
      ["Financials", 0.2083],
    ],
  },
] as const;

const MIX = [
  ["Technology", 0.5256],
  ["Financials", 0.0909],
  ["Communication Services", 0.0887],
  ["Health Care", 0.0838],
  ["Consumer Discretionary", 0.0659],
  ["Industrials", 0.0606],
  ["Everything else", 0.0846],
] as const;

const MIX_MAX = Math.max(...MIX.map(([, w]) => w));

export function ExposureMock() {
  const total = ETFS.reduce((sum, e) => sum + e.amount, 0);
  return (
    <Panel
      title="Your sector mix"
      caption={
        <>
          <span className="text-fg/85">Technology</span> = 60% × 38.3% (IVV) + 30% × 90.3% (IYW) + 10% × 24.9% (ARKK) ={" "}
          <span className="text-fg/85">52.6%</span>
        </>
      }
    >
      <div className="px-4 pt-4 pb-5 sm:px-5">
        <div className="label">Your ETFs, opened up</div>
        <ul className="mt-3 divide-y divide-line/70">
          {ETFS.map((e) => (
            <li key={e.ticker} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[3.5rem_4.5rem_minmax(0,1fr)]">
              <span className="font-mono text-[13px] text-fg">{e.ticker}</span>
              <span className="font-mono text-[12.5px] text-muted tabular-nums">{dollars(e.amount)}</span>
              <span className="col-span-2 text-[12.5px] leading-snug text-muted sm:col-span-1">
                {e.inside.map(([sector, w], i) => (
                  <span key={sector}>
                    {i > 0 && <span className="text-faint"> · </span>}
                    {sector} <span className="font-mono text-fg/80 tabular-nums">{pct(w)}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative border-t border-line">
        <span className="label absolute top-0 left-4 -translate-y-1/2 bg-panel px-2 sm:left-5">
          Blended by your {dollars(total)}
        </span>
      </div>

      <div className="px-4 pt-6 pb-5 sm:px-5">
        <ul className="space-y-3">
          {MIX.map(([sector, w]) => (
            <li key={sector} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)_3.5rem]">
              <span className={`text-[13px] ${sector === "Everything else" ? "text-muted" : "text-fg/90"}`}>{sector}</span>
              <span className="text-right font-mono text-[12.5px] text-fg tabular-nums sm:order-last">{pct(w)}</span>
              <span aria-hidden className="col-span-2 block h-2 rounded-[2px] bg-panel-3 sm:col-span-1">
                <span
                  className={`block h-full rounded-[2px] ${sector === "Everything else" ? "bg-faint" : "bg-accent"}`}
                  style={{ width: `${(w / MIX_MAX) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Target: the assistant turns words into numbers; the sliders show now vs. target.

const TARGET_ROWS = [
  { sector: "Technology", now: 0.5256, target: 0.4756 },
  { sector: "Health Care", now: 0.0838, target: 0.1338 },
  { sector: "Financials", now: 0.0909, target: 0.0909 },
  { sector: "Communication Services", now: 0.0887, target: 0.0887 },
];

function SliderTrack({ now, target }: { now: number; target: number }) {
  const lo = Math.min(now, target);
  const diff = Math.abs(target - now);
  const tone = target > now ? "bg-up" : "bg-down";
  return (
    <span aria-hidden className="relative block h-4">
      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line-2" />
      <span
        className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-accent/45"
        style={{ width: `${lo * 100}%` }}
      />
      {diff > 0 && (
        <span
          className={`absolute top-1/2 h-[3px] -translate-y-1/2 ${tone}`}
          style={{ left: `${lo * 100}%`, width: `${diff * 100}%` }}
        />
      )}
      {/* "Now" tick, then the thumb at the target. */}
      <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fg/55" style={{ left: `${now * 100}%` }} />
      <span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-fg shadow-[0_0_0_1px_var(--color-line-2)]"
        style={{ left: `${target * 100}%` }}
      />
    </span>
  );
}

export function TargetMock() {
  return (
    <Panel
      title="Your target mix"
      caption={
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-3 w-px bg-fg/55" />
            Your mix now
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-fg" />
            Your target
          </span>
          <span className="sm:ml-auto">Sliders run from 0% to 100%</span>
        </span>
      }
    >
      <div className="space-y-4 px-4 pt-5 pb-5 sm:px-5">
        <p className="ml-auto w-fit max-w-[85%] rounded-[10px] rounded-br-[3px] bg-panel-3 px-3.5 py-2.5 text-[14px] leading-snug text-fg">
          Less tech, more health care
        </p>
        <div className="max-w-[92%]">
          <div className="flex items-center gap-2">
            <svg aria-hidden viewBox="0 0 12 12" width="11" height="11" className="text-accent">
              <path d="M6 0.5L7.3 4.7L11.5 6L7.3 7.3L6 11.5L4.7 7.3L0.5 6L4.7 4.7Z" fill="currentColor" />
            </svg>
            <span className="label">Assistant</span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-fg/90">
            Done. Your target is now Technology {pct(0.4756)}{" "}
            <span className="whitespace-nowrap text-down">({pp(-0.05)})</span> and Health Care {pct(0.1338)}{" "}
            <span className="whitespace-nowrap text-up">({pp(0.05)})</span>. Everything else stays where it was.
          </p>
        </div>
      </div>

      <div className="border-t border-line px-4 pt-4 pb-5 sm:px-5">
        <div className="flex items-baseline justify-between">
          <span className="label">Target by sector</span>
          <span className="label">Target · change</span>
        </div>
        <ul className="mt-4 space-y-4">
          {TARGET_ROWS.map((r) => {
            const change = r.target - r.now;
            const tone = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-faint";
            return (
              <li key={r.sector}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-fg/90">{r.sector}</span>
                  <span className="font-mono text-[12.5px] tabular-nums">
                    <span className="text-fg">{pct(r.target)}</span>
                    <span className={`ml-3 inline-block w-[4.5rem] text-right ${tone}`}>{pp(change)}</span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <SliderTrack now={r.now} target={r.target} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div aria-hidden className="flex items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <span className="flex h-9 min-w-0 flex-1 items-center truncate rounded-md border border-line bg-canvas px-3 text-[13px] text-faint">
          Tell the assistant the mix you want…
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-fg text-canvas">
          <svg viewBox="0 0 12 12" width="11" height="11">
            <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
        </span>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Plans: the moves toward the target, how close they get and how much money moves.

type Action = "Reduce" | "Increase" | "Add";

const MOVES: { action: Action; ticker: string; name: string; before: number; after: number }[] = [
  { action: "Reduce", ticker: "IYW", name: "iShares U.S. Technology ETF", before: 3000, after: 2376 },
  { action: "Reduce", ticker: "ARKK", name: "ARK Innovation ETF", before: 1000, after: 825 },
  { action: "Add", ticker: "IYH", name: "iShares U.S. Healthcare ETF", before: 0, after: 518 },
  { action: "Increase", ticker: "IVV", name: "iShares Core S&P 500 ETF", before: 6000, after: 6281 },
];

const PLAN = { distanceBefore: 0.05, distanceAfter: 0.004, moved: 799, newEtfs: 1 };
const OTHER_PLAN = { title: "Rearrange the ETFs you own", distanceAfter: 0.0428, moved: 1555 };

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="label">{label}</div>
      <div className="mt-1.5 font-mono text-[13px] text-fg tabular-nums sm:text-[14px]">{children}</div>
    </div>
  );
}

export function PlanMock() {
  return (
    <Panel
      title="Plans for your target"
      caption="Each plan says how close it gets and how much money moves. Nothing happens until you act on it yourself."
    >
      <div className="relative border-b border-line bg-accent-strong/10">
        <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-0.5 bg-accent" />
        <div className="px-4 pt-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[15px] text-fg">Rearrange and add new ETFs</span>
            <span className="border border-line-2 px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-fg/75 uppercase">
              {PLAN.newEtfs} new ETF
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            Gets you to within {ppLevel(PLAN.distanceAfter)} of your target (now {ppLevel(PLAN.distanceBefore)}{" "}
            away).
          </p>
        </div>

        <ul className="mt-3 border-t border-line/70">
          {MOVES.map((m) => {
            const change = m.after - m.before;
            const up = change > 0;
            return (
              <li
                key={m.ticker}
                className="grid grid-cols-[5.5rem_3.25rem_minmax(0,1fr)] items-center gap-x-3 border-b border-line/50 px-4 py-2.5 last:border-b-0 sm:grid-cols-[5.75rem_3.5rem_minmax(0,1fr)_auto] sm:px-5"
              >
                <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-fg/80 uppercase">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-[1px] ${up ? "bg-up" : "bg-down"}`} />
                  {m.action}
                </span>
                <span className="font-mono text-[13px] text-fg">{m.ticker}</span>
                <span className="hidden min-w-0 truncate text-[12.5px] text-muted sm:block">{m.name}</span>
                <span className="text-right font-mono text-[12.5px] tabular-nums">
                  <span className="hidden text-faint min-[440px]:inline">
                    {m.before > 0 ? dollars(m.before) : "new"} → {dollars(m.after)}
                  </span>
                  <span className={`ml-3 inline-block min-w-[3.75rem] ${up ? "text-up" : "text-down"}`}>
                    {up ? "+" : MINUS}
                    {dollars(Math.abs(change))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <Stat label="Distance">
          {(PLAN.distanceBefore * 100).toFixed(1)} → {ppLevel(PLAN.distanceAfter)}
        </Stat>
        <Stat label="Money moved">{dollars(PLAN.moved)}</Stat>
        <Stat label="New ETFs">{PLAN.newEtfs} of 2</Stat>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3.5 sm:px-5">
        <span className="text-[14px] text-fg/75">{OTHER_PLAN.title}</span>
        <span className="font-mono text-[12px] text-muted tabular-nums">
          within {ppLevel(OTHER_PLAN.distanceAfter)} · moves {dollars(OTHER_PLAN.moved)}
        </span>
      </div>
    </Panel>
  );
}
