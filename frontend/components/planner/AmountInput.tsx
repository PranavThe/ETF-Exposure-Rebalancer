"use client";

import { useState } from "react";

/** A dollar amount field that lets you type freely and reports parsed numbers as you go. */
export default function AmountInput({
  value,
  onValue,
  label,
  className = "",
  placeholder = "0",
}: {
  value: number;
  onValue: (v: number) => void;
  label: string;
  className?: string;
  placeholder?: string;
}) {
  // What the user typed, kept only while it still describes `value` (an outside change wins).
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null);
  const text = draft && draft.value === value ? draft.text : value ? String(Math.round(value * 100) / 100) : "";

  return (
    <label className={`flex h-8 items-center gap-1 rounded-md border border-line bg-canvas px-2 focus-within:border-line-2 ${className}`}>
      <span className="font-mono text-xs text-faint">$</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.,]/g, "");
          const parsed = Number(cleaned.replace(/,/g, ""));
          const v = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          setDraft({ text: cleaned, value: v });
          onValue(v);
        }}
        className="w-full min-w-0 bg-transparent text-right font-mono text-sm tabular-nums text-fg placeholder:text-faint focus:outline-none"
      />
    </label>
  );
}
