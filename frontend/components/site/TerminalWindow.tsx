import Image from "next/image";

import { BRAND } from "@/lib/brand";

/** The real terminal, captured at 1440x900, inside a macOS-style window frame. */
export default function TerminalWindow() {
  return (
    <figure className="relative">
      {/* Soft glow behind the window. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(122,115,240,0.12),transparent)] blur-2xl"
      />
      <div className="overflow-hidden rounded-[10px] border border-line-2 bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="relative flex h-8 items-center border-b border-line px-3 sm:h-9">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-[12px] text-faint sm:text-[13px]">{BRAND}</span>
        </div>
        <Image
          src="/product/terminal.png"
          alt={`The ${BRAND} terminal comparing the DEMO fund from 2026-10-01 to 2026-10-02: a sector chart splitting each drift into price effect and portfolio activity, an event list, an inspector, and the holdings table.`}
          width={1440}
          height={900}
          sizes="(min-width: 1024px) 56vw, 100vw"
          className="block h-auto w-full"
        />
      </div>
      <figcaption className="label mt-4 text-center">DEMO fund · 2026-10-01 → 2026-10-02 · live terminal capture</figcaption>
    </figure>
  );
}
