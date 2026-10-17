// A static copy of the terminal's event list for DEMO, 2026-10-01 → 2026-10-02. IDs,
// descriptions and hashes are the real API output; the BBB row is shown selected.

const EVENTS = [
  {
    id: "652756154a49a8c0",
    type: "SECTOR UP",
    tone: "text-up",
    description: "Health Care exposure +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)",
  },
  {
    id: "03cbc5a3c0d538db",
    type: "SECTOR DOWN",
    tone: "text-down",
    description: "Financials exposure −5.0 pp (price −2.8 pp, portfolio activity −2.2 pp)",
  },
  {
    id: "4bd641dfb2bf2b67",
    type: "CONC. UP",
    tone: "text-up",
    description: "Top-2 concentration +10.0 pp (price +5.6 pp, portfolio activity +4.4 pp)",
  },
  {
    id: "be2a77c9b571e607",
    type: "REMOVED",
    tone: "text-down",
    description: "Position in CCC removed: weight −25.0 pp (price −2.8 pp, portfolio activity −22.2 pp)",
  },
  {
    id: "54fed5af256add6e",
    type: "ADDED",
    tone: "text-up",
    description: "New position in EEE: weight +20.0 pp (price 0.0 pp, portfolio activity +20.0 pp)",
  },
  {
    id: "80f36f6c6bb80255",
    type: "INCREASED",
    tone: "text-up",
    description:
      "Increased position in BBB: flow-adjusted share count +50.0%, weight +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)",
    selected: true,
  },
];

const SOURCES = [
  { side: "FROM", date: "2026-10-01", file: "demo_2026-10-01.csv", hash: "0215fd6d30c3c181" },
  { side: "TO", date: "2026-10-02", file: "demo_2026-10-02.csv", hash: "242c976c69847b76" },
];

export default function EventsMock() {
  return (
    <figure className="mx-auto w-full max-w-[640px] overflow-hidden rounded-[10px] border border-line bg-panel">
      <div className="flex h-9 items-stretch border-b border-line text-[13px]">
        <span className="flex items-center gap-1.5 border-r border-line bg-panel-2 px-3 text-fg">
          Events <span className="font-mono text-xs text-faint">6</span>
        </span>
        <span className="flex items-center border-r border-line px-3 text-faint">Position changes</span>
        <span className="ml-auto hidden items-center px-3 font-mono text-[11px] text-faint sm:flex">
          DEMO · 2026-10-01 → 2026-10-02
        </span>
      </div>

      <ul>
        {EVENTS.map((e) => (
          <li
            key={e.id}
            className={`border-b border-line/60 px-3 py-2.5 sm:px-4 ${
              e.selected ? "bg-accent-strong/15 shadow-[inset_2px_0_0_var(--color-accent)]" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`font-mono text-[11px] tracking-[0.02em] ${e.tone}`}>{e.type}</span>
              <span className="font-mono text-[10.5px] text-faint">{e.id}</span>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-fg/90 sm:text-[13.5px]">{e.description}</p>
          </li>
        ))}
      </ul>

      <figcaption className="space-y-1.5 bg-canvas/40 px-3 py-3 sm:px-4">
        <div className="label">Source data · contributing holdings: BBB</div>
        {SOURCES.map((s) => (
          <div
            key={s.side}
            className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-1.5 font-mono text-[11px] text-muted"
          >
            <span className="w-9 shrink-0 text-faint">{s.side}</span>
            <span className="shrink-0 text-fg/85">{s.date}</span>
            <span className="hidden truncate sm:inline">{s.file}</span>
            <span className="ml-auto shrink-0 text-faint">
              sha256 <span className="sm:hidden">{s.hash.slice(0, 8)}…</span>
              <span className="hidden sm:inline">{s.hash}…</span>
            </span>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
