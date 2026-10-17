import type { ChangeEvent } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  POSITION_ADDED: "Position added",
  POSITION_REMOVED: "Position removed",
  POSITION_INCREASED: "Increased position",
  POSITION_DECREASED: "Decreased position",
  SECTOR_INCREASE: "Sector exposure up",
  SECTOR_DECREASE: "Sector exposure down",
  CONCENTRATION_INCREASE: "Concentration up",
  CONCENTRATION_DECREASE: "Concentration down",
  SUSPECTED_CORPORATE_ACTION: "Suspected corporate action",
};

export default function EventList({
  events,
  selectedId,
  onSelect,
}: {
  events: ChangeEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <section className="min-w-0 rounded border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold">Events</h2>
      <p className="mb-2 text-sm text-zinc-600">
        Click an event to highlight its holdings in the table below.
      </p>
      {events.length === 0 ? (
        <p className="rounded bg-zinc-50 px-3 py-4 text-sm text-zinc-600">
          No change crossed the event thresholds in this range.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const selected = e.id === selectedId;
            const n = e.contributing_security_ids.length;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  data-event-id={e.id}
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : e.id)}
                  className={`w-full rounded border px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                      : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex justify-between gap-2 text-xs text-zinc-500">
                    <span className="font-medium uppercase tracking-wide">
                      {TYPE_LABELS[e.type] ?? e.type}
                    </span>
                    <span>
                      {n} holding{n === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-0.5">{e.description}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
