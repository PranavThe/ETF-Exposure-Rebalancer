import type { ChangeEvent, Changes, HoldingChange } from "@/lib/api";
import { hhi, pct, pp, shares, signedHhi, signedPct } from "@/lib/format";
import { EVENT_TYPES, FLAGS, STATUS, tone } from "@/lib/labels";

import { eventValue } from "./EventList";
import SummaryCards from "./SummaryCards";
import EffectBars from "./ui/EffectBars";

export type Selection = { kind: "event" | "holding"; id: string };

function Stat({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-mono text-xs ${className}`}>{value}</span>
    </div>
  );
}

function HoldingDetail({ h }: { h: HoldingChange }) {
  const status = STATUS[h.status];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-xs ${status.className}`}>{status.label}</span>
        {h.flags.map((f) => (
          <span key={f} title={FLAGS[f]?.title} className="rounded border border-line-2 px-1.5 py-0.5 text-[11px] text-muted">
            {FLAGS[f]?.label ?? f}
          </span>
        ))}
      </div>
      <div>
        <div className="label">Weight change</div>
        <div className={`text-2xl font-semibold ${tone(h.w_to - h.w_from)}`}>{pp(h.w_to - h.w_from)}</div>
      </div>
      <EffectBars price={h.price_effect} activity={h.activity_effect} />
      <div>
        <Stat label="Weight" value={`${pct(h.w_from)} → ${pct(h.w_to)}`} />
        <Stat label="Counterfactual weight" value={pct(h.w_cf)} />
        <Stat label="Shares" value={`${shares(h.shares_from)} → ${shares(h.shares_to)}`} />
        <Stat
          label="Flow-adjusted share change"
          value={h.adj_share_change === null ? "—" : signedPct(h.adj_share_change)}
          className={h.adj_share_change === null ? "text-faint" : tone(h.adj_share_change)}
        />
        <Stat
          label="Price"
          value={`${h.price_from === null ? "—" : h.price_from.toFixed(2)} → ${h.price_to === null ? "—" : h.price_to.toFixed(2)}`}
        />
        <Stat label="Sector" value={h.sector} />
      </div>
    </div>
  );
}

function Contributors({ ids, holdings }: { ids: string[]; holdings: HoldingChange[] }) {
  const byId = new Map(holdings.map((h) => [h.security_id, h]));
  return (
    <div>
      <div className="label mb-1">Contributing holdings</div>
      <ul className="divide-y divide-line/60">
        {ids.map((id) => {
          const h = byId.get(id);
          if (!h) return null;
          return (
            <li key={id} className="flex items-center justify-between py-1.5 text-sm">
              <span>{h.ticker || h.name}</span>
              <span className="font-mono text-xs text-muted">
                {pct(h.w_from)} → {pct(h.w_to)}{" "}
                <span className={tone(h.w_to - h.w_from)}>{pp(h.w_to - h.w_from)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EventDetail({ event, data }: { event: ChangeEvent; data: Changes }) {
  const holding = data.holdings.find((h) => h.security_id === event.subject);
  const sector = data.sectors.find((s) => s.sector === event.subject);
  const s = data.summary;
  const isConcentration = event.type.startsWith("CONCENTRATION");
  const title = holding
    ? holding.ticker || holding.name
    : isConcentration
      ? `Top-${s.top_n} share`
      : event.subject;

  return (
    <div className="space-y-4 p-3">
      <div>
        <div className="label">{EVENT_TYPES[event.type]?.label ?? event.type}</div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className="font-mono text-sm">{eventValue(event)}</span>
        </div>
        {holding?.ticker && <div className="text-xs text-muted">{holding.name}</div>}
      </div>
      <p className="text-sm leading-relaxed text-fg/85">{event.description}</p>

      {holding && <HoldingDetail h={holding} />}
      {sector && (
        <div className="space-y-3">
          <EffectBars price={sector.price_effect} activity={sector.activity_effect} />
          <div>
            <Stat label="Weight" value={`${pct(sector.w_from)} → ${pct(sector.w_to)}`} />
            <Stat label="Activity, direct" value={pp(sector.activity_direct)} />
            <Stat label="Activity, dilution" value={pp(sector.activity_dilution)} />
          </div>
        </div>
      )}
      {isConcentration && (
        <div className="space-y-3">
          <EffectBars price={s.top_n_share.cf - s.top_n_share.from} activity={s.top_n_share.to - s.top_n_share.cf} />
          <div>
            <Stat label={`Top-${s.top_n} share`} value={`${pct(s.top_n_share.from)} → ${pct(s.top_n_share.to)}`} />
            <Stat label="HHI" value={`${hhi(s.hhi.from)} → ${hhi(s.hhi.to)} (${signedHhi(s.hhi.to - s.hhi.from)})`} />
          </div>
        </div>
      )}
      {!holding && <Contributors ids={event.contributing_security_ids} holdings={data.holdings} />}
      <div className="font-mono text-[11px] text-faint">Event id {event.id}</div>
    </div>
  );
}

export default function Inspector({ data, selection }: { data: Changes; selection: Selection | null }) {
  if (selection?.kind === "event") {
    const event = data.events.find((e) => e.id === selection.id);
    if (event) return <EventDetail event={event} data={data} />;
  }
  if (selection?.kind === "holding") {
    const holding = data.holdings.find((h) => h.security_id === selection.id);
    if (holding) {
      return (
        <div className="space-y-4 p-3">
          <div>
            <div className="label">Holding</div>
            <h3 className="text-lg font-semibold">{holding.ticker || holding.name}</h3>
            {holding.ticker && <div className="text-xs text-muted">{holding.name}</div>}
          </div>
          <HoldingDetail h={holding} />
        </div>
      );
    }
  }
  return <SummaryCards changes={data} />;
}
