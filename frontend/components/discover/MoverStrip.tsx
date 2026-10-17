import Link from "next/link";

import { pct, pp } from "@/lib/format";
import { terminalHref } from "@/lib/hooks";
import { tone } from "@/lib/labels";

import { FundBadge } from "./bits";
import { ppNum, weightChange, type Mover } from "./derive";

function MoverCard({ mover, hidden }: { mover: Mover; hidden: boolean }) {
  const { overview, holding: h } = mover;
  const c = overview.changes!;
  const change = weightChange(h);
  return (
    <Link
      href={terminalHref(overview.fund.ticker, c.from.as_of_date, c.to.as_of_date)}
      tabIndex={hidden ? -1 : undefined}
      title={`${h.name}: ${pp(change)} (price ${pp(h.price_effect)}, portfolio activity ${pp(h.activity_effect)})`}
      className="flex w-[16.5rem] shrink-0 items-center gap-2.5 rounded-lg border border-line bg-panel px-2.5 py-2 hover:border-line-2 hover:bg-panel-2"
    >
      <FundBadge ticker={overview.fund.ticker} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">
          {h.ticker || h.name} <span className="font-normal text-muted">{h.name}</span>
        </span>
        <span className="block font-mono text-[11px] text-faint">
          {pct(h.w_from)} → {pct(h.w_to)}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono tabular-nums">
        <span className={`block text-[13px] ${tone(change)}`}>{pp(change)}</span>
        <span className="block text-[10px]">
          <span className="text-accent">P {ppNum(h.price_effect)}</span>{" "}
          <span className="text-activity">A {ppNum(h.activity_effect)}</span>
        </span>
      </span>
    </Link>
  );
}

/** A marquee of the holdings whose weights moved most. */
export default function MoverStrip({ movers }: { movers: Mover[] }) {
  if (movers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-3.5 text-center text-sm text-faint">
        No holding weights moved in the funds shown. Movers appear once a fund has two snapshots.
      </div>
    );
  }
  // The track holds two identical copies and slides by half its width; each copy must outrun a wide screen.
  const items = Array.from({ length: Math.ceil(10 / movers.length) }, () => movers).flat();
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_3%,black_97%,transparent)]">
      <div className="ticker-track flex w-max">
        {[false, true].map((hidden) => (
          <div key={String(hidden)} aria-hidden={hidden || undefined} className="flex shrink-0 gap-2 pr-2">
            {items.map((m, i) => (
              <MoverCard key={`${m.overview.fund.ticker}-${m.holding.security_id}-${i}`} mover={m} hidden={hidden} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
