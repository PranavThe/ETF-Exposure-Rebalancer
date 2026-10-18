"use client";

import { useEffect, useRef, useState } from "react";

import Panel from "@/components/ui/Panel";
import type { ChatTurn } from "@/lib/planner";

const EXAMPLES = ["Less tech, more health care", "No energy", "30% financials", "I'm adding $2,000"];

/** Right column, bottom: tell the assistant the mix you want in your own words. */
export default function ChatPanel({
  turns,
  busy,
  onSend,
}: {
  turns: (ChatTurn & { note?: string })[];
  busy: boolean;
  onSend: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest message in view by scrolling the panel itself, never the page.
  useEffect(() => {
    const box = end.current?.closest("[role=tabpanel]");
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns.length, busy]);

  function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    onSend(m);
    setText("");
  }

  return (
    <Panel
      tabs={[{ id: "chat", label: "Assistant" }]}
      active="chat"
      className="h-[380px] lg:h-auto lg:min-h-[260px] lg:flex-[2]"
      bodyClassName="flex flex-col"
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex gap-2 p-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Say the mix you want…"
            aria-label="Message the assistant"
            maxLength={1000}
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 text-sm text-fg placeholder:text-faint focus:border-accent-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-md bg-accent-strong px-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      }
    >
      <div className="flex-1 space-y-3 px-3 py-3">
        <div className="max-w-[90%] rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-fg">
          Tell me the sector mix you want, in your own words, and I’ll set your target. You decide what you want; I only
          do the math.
        </div>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => send(e)}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent-strong hover:text-fg"
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-md bg-accent-strong/25 px-3 py-2 text-sm text-fg">
              {t.content}
            </div>
          ) : (
            <div key={i} className="max-w-[90%]">
              <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-fg">{t.content}</div>
              {t.note && <p className="mt-1 px-1 font-mono text-[10px] text-faint">{t.note}</p>}
            </div>
          ),
        )}
        {busy && <p className="px-1 font-mono text-xs text-faint">thinking…</p>}
        <div ref={end} />
      </div>
    </Panel>
  );
}
