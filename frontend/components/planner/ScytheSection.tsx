"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatTurn } from "@/lib/planner";

import { ScytheMark } from "./ui";

const EXAMPLES = ["Less tech, more health care", "No energy", "30% financials", "More utilities and real estate"];

function Avatar() {
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-strong/12 ring-1 ring-accent-strong/30">
      <ScytheMark size={15} />
    </span>
  );
}

/** Right column: Scythe, the assistant that turns plain words into a target mix. */
export default function ScytheSection({
  turns,
  busy,
  waiting = false,
  onSend,
  connected,
}: {
  turns: (ChatTurn & { note?: string })[];
  busy: boolean;
  waiting?: boolean; // the mix is still loading, so Scythe can't read it yet
  onSend: (message: string) => void;
  connected: boolean | null;
}) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest message in view by scrolling this column, never the page.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);

  function send(message: string) {
    const m = message.trim();
    if (!m || busy || waiting) return;
    onSend(m);
    setText("");
  }

  return (
    <section className="flex h-[560px] min-h-0 flex-col xl:h-auto xl:flex-1">
      <div className="flex shrink-0 items-center gap-3 px-6 pb-4 pt-5">
        <ScytheMark size={20} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-fg">Scythe</h2>
          <p className="text-[12.5px] text-muted">Say the mix you want. You decide; Scythe does the math.</p>
        </div>
        {connected !== null && (
          <span className={`ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] ${connected ? "text-up" : "text-faint"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-up" : "bg-faint"}`} />
            {connected ? "Claude" : "basic"}
          </span>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-auto border-t border-line px-6 py-5">
        <div className="flex gap-3">
          <Avatar />
          <p className="pt-1 text-[14px] leading-relaxed text-fg/90">
            Tell me how you’d like your money spread across sectors, in your own words, and I’ll set your target. I won’t
            tell you what to want.
          </p>
        </div>
        {turns.length === 0 && (
          <div className="flex flex-col items-start gap-2 pl-10">
            {EXAMPLES.map((e, i) => (
              <button
                key={e}
                type="button"
                onClick={() => send(e)}
                className="animate-fade-up rounded-full border border-line px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:border-accent-strong/60 hover:text-fg"
                style={{ animationDelay: `${100 + i * 60}ms` }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex animate-fade-up justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-strong/85 px-4 py-2.5 text-[14px] leading-relaxed text-white">{t.content}</p>
            </div>
          ) : (
            <div key={i} className="flex animate-fade-up gap-3">
              <Avatar />
              <div className="min-w-0 pt-1">
                <p className="text-[14px] leading-relaxed text-fg/90">{t.content}</p>
                {t.note && <p className="mt-1 font-mono text-[10.5px] text-faint">{t.note}</p>}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex animate-fade-in gap-3">
            <Avatar />
            <div className="flex items-center gap-1 pt-3">
              {[0, 1, 2].map((d) => (
                <span key={d} className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${d * 160}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="shrink-0 border-t border-line px-6 py-4"
      >
        <div className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 pl-4 pr-1.5 transition-colors focus-within:border-accent-strong/70">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message Scythe…"
            aria-label="Message Scythe"
            maxLength={1000}
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-fg placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || waiting || !text.trim()}
            aria-label="Send"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-strong text-white transition-all hover:bg-accent hover:text-canvas active:scale-95 disabled:bg-panel-3 disabled:text-faint"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </form>
    </section>
  );
}
