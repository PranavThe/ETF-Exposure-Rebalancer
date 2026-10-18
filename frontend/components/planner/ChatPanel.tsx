"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatTurn } from "@/lib/planner";

import { BrandMark, Pane } from "./ui";

const EXAMPLES = ["Less tech, more health care", "No energy", "30% financials", "I'm adding $2,000"];

function Avatar() {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-strong/15 ring-1 ring-accent-strong/40">
      <BrandMark size={14} />
    </span>
  );
}

/** Right column, bottom: tell the assistant the mix you want in your own words. */
export default function ChatPanel({
  turns,
  busy,
  onSend,
  connected,
}: {
  turns: (ChatTurn & { note?: string })[];
  busy: boolean;
  onSend: (message: string) => void;
  connected: boolean | null;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest message in view by scrolling the panel itself, never the page.
  useEffect(() => {
    const box = end.current?.closest("[role=tabpanel]");
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);

  function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    onSend(m);
    setText("");
  }

  return (
    <Pane
      tabs={[{ id: "chat", label: "Assistant" }]}
      active="chat"
      className="h-[440px] lg:h-auto lg:min-h-[240px] lg:flex-1"
      bodyClassName="flex flex-col"
      right={
        connected !== null && (
          <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[10.5px] ${connected ? "bg-up/10 text-up" : "bg-panel-3 text-faint"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-up" : "bg-faint"}`} />
            {connected ? "Claude" : "basic"}
          </span>
        )
      }
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="p-2.5"
        >
          <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas pl-3 pr-1.5 transition-colors focus-within:border-accent-strong/70">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say the mix you want…"
              aria-label="Message the assistant"
              maxLength={1000}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              aria-label="Send"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-strong text-white transition-all hover:bg-accent hover:text-canvas active:scale-95 disabled:bg-panel-3 disabled:text-faint"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </form>
      }
    >
      <div className="flex-1 space-y-3 px-3 py-3">
        <div className="flex gap-2.5">
          <Avatar />
          <div className="rounded-lg rounded-tl-sm bg-panel-2 px-3 py-2 text-[13.5px] leading-relaxed text-fg ring-1 ring-line">
            Tell me the sector mix you want in your own words and I’ll set your target. You decide; I just do the math.
          </div>
        </div>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pl-[34px]">
            {EXAMPLES.map((e, i) => (
              <button
                key={e}
                type="button"
                onClick={() => send(e)}
                className="animate-fade-up rounded-full border border-line px-3 py-1.5 text-[12px] text-muted transition-all hover:border-accent-strong/60 hover:bg-accent-strong/10 hover:text-fg"
                style={{ animationDelay: `${150 + i * 60}ms` }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex animate-fade-up justify-end">
              <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-accent-strong/90 px-3 py-2 text-[13.5px] text-white shadow-[0_6px_20px_-10px_rgba(122,115,240,0.9)]">
                {t.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex animate-fade-up gap-2.5">
              <Avatar />
              <div className="min-w-0 max-w-[88%]">
                <div className="rounded-lg rounded-tl-sm bg-panel-2 px-3 py-2 text-[13.5px] leading-relaxed text-fg ring-1 ring-line">{t.content}</div>
                {t.note && <p className="mt-1 px-1 font-mono text-[10px] text-faint">{t.note}</p>}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex animate-fade-in gap-2.5">
            <Avatar />
            <div className="flex items-center gap-1 rounded-lg rounded-tl-sm bg-panel-2 px-3 py-3 ring-1 ring-line">
              {[0, 1, 2].map((d) => (
                <span key={d} className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${d * 160}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
    </Pane>
  );
}
