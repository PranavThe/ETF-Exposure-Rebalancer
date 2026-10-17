import type { ChangeEvent } from "@/lib/api";
import { pp } from "@/lib/format";
import { EVENT_TYPES, tone } from "@/lib/labels";

export function eventValue(e: ChangeEvent): string {
  // A corporate action's magnitude is the share ratio, not a weight change.
  return e.type === "SUSPECTED_CORPORATE_ACTION" ? `×${e.magnitude.toFixed(2)}` : pp(e.magnitude);
}

export default function EventList({
  events,
  selectedId,
  onSelect,
}: {
  events: ChangeEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted">
        No change crossed the event thresholds in this range.
      </p>
    );
  }
  return (
    <div className="text-sm">
      <div className="label sticky top-0 grid grid-cols-[6.5rem_1fr_4.75rem] gap-2 border-b border-line bg-panel px-3 py-2">
        <span>Type</span>
        <span>Subject</span>
        <span className="text-right">Δ</span>
      </div>
      <ul>
        {events.map((e) => {
          const selected = e.id === selectedId;
          const isSplit = e.type === "SUSPECTED_CORPORATE_ACTION";
          return (
            <li key={e.id}>
              <button
                type="button"
                data-event-id={e.id}
                aria-pressed={selected}
                title={e.description}
                onClick={() => onSelect(selected ? null : e.id)}
                className={`grid w-full grid-cols-[6.5rem_1fr_4.75rem] items-center gap-2 border-b border-line/60 px-3 py-2 text-left ${
                  selected ? "bg-accent-strong/15 shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-panel-2"
                }`}
              >
                <span className={`font-mono text-[11px] ${isSplit ? "text-activity" : tone(e.magnitude)}`}>
                  {EVENT_TYPES[e.type]?.short ?? e.type}
                </span>
                <span className="truncate">{e.subject === "portfolio" ? "Portfolio" : e.subject}</span>
                <span className={`text-right font-mono tabular-nums ${isSplit ? "text-activity" : tone(e.magnitude)}`}>
                  {eventValue(e)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
