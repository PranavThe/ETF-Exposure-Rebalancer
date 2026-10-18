"use client";

import { useState } from "react";

/** A dollar amount field that lets you type freely and reports parsed numbers as you go. */
export default function AmountInput({
  value,
  onValue,
  label,
  className = "",
  placeholder = "0",
  suffix,
  autoFocus,
}: {
  value: number;
  onValue: (v: number) => void;
  label: string;
  className?: string;
  placeholder?: string;
  suffix?: string;
  autoFocus?: boolean;
}) {
  // What the user typed, kept only while it still describes `value` (an outside change wins).
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null);
  // The same text focused or not: changing it on focus moved the caret, so typing appended.
  const formatted = value ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";
  const text = draft && draft.value === value ? draft.text : formatted;

  return (
    <label
      className={`flex h-9 items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 transition-colors focus-within:border-accent-strong/70 hover:border-line-2 ${className}`}
    >
      <span className="font-mono text-[13px] text-faint">$</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={(e) => requestAnimationFrame(() => e.target.select())}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.,]/g, "");
          const parsed = Number(cleaned.replace(/,/g, ""));
          const v = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          setDraft({ text: cleaned, value: v });
          onValue(v);
        }}
        className="w-full min-w-0 bg-transparent text-right font-mono text-[14px] tabular-nums text-fg placeholder:text-faint focus:outline-none"
      />
      {suffix && <span className="shrink-0 text-[11px] font-medium text-faint">{suffix}</span>}
    </label>
  );
}
