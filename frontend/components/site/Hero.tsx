import Link from "next/link";

import { BRAND } from "@/lib/brand";

import { Crosshair } from "./Frame";
import { LAUNCH_APP } from "./links";

const DATA_SOURCES = ["ARK Invest", "iShares", "SEC N-PORT filings"];

/** White rectangular call to action with crosshair marks at its corners. */
export function LaunchButton() {
  return (
    <Link
      href={LAUNCH_APP.href}
      className="site-cta relative inline-flex h-11 items-center gap-2.5 bg-white px-6 font-mono text-[12px] tracking-[0.06em] text-black uppercase transition-colors hover:bg-[#ecebff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      <svg aria-hidden viewBox="0 0 12 12" width="11" height="11" className="-ml-0.5">
        <path d="M1.5 10.5L10.5 1.5M4 1.5h6.5V8" stroke="currentColor" strokeWidth="1.4" fill="none" />
      </svg>
      {LAUNCH_APP.label}
      <span className="contents text-white">
        <Crosshair size={7} className="site-corner site-corner-tl -top-[4px] -left-[4px]" />
        <Crosshair size={7} className="site-corner site-corner-tr -top-[4px] -right-[4px]" />
        <Crosshair size={7} className="site-corner site-corner-bl -bottom-[4px] -left-[4px]" />
        <Crosshair size={7} className="site-corner site-corner-br -right-[4px] -bottom-[4px]" />
      </span>
    </Link>
  );
}

export default function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex min-h-[max(620px,calc(100svh-105px))] flex-col overflow-hidden bg-[#050506]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_25%,rgba(122,115,240,0.14),transparent_48%),radial-gradient(ellipse_at_15%_80%,rgba(201,133,0,0.08),transparent_40%)]" />
      <div className="relative flex flex-1 flex-col justify-end px-5 pt-40 pb-12 sm:px-8 sm:pb-14 lg:px-14">
        <h1
          id="hero-heading"
          className="site-gradient-text max-w-[1040px] pb-[0.08em] text-[44px] leading-[1.02] font-light tracking-[-0.035em] text-balance sm:text-[64px] lg:text-[84px]"
        >
          See what you really own. Choose the mix you want.
        </h1>
        <p className="mt-6 max-w-[580px] text-[16px] leading-[1.6] text-muted sm:text-[17px]">
          Add the ETFs you hold and how much is in each. {BRAND} looks inside every fund, shows how your money is
          spread across sectors, and works out the moves that get you to the mix you choose.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
          <LaunchButton />
          <a
            href="#how"
            className="font-mono text-[12px] tracking-[0.06em] text-fg/60 uppercase transition-colors hover:text-fg"
          >
            See how it works ↓
          </a>
        </div>
      </div>

      <div className="relative mx-5 border-t border-line text-faint sm:mx-8 lg:mx-14">
        <Crosshair className="left-1/2 -top-[5px] -translate-x-1/2" />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 py-6 sm:gap-x-10">
          <span className="label">Holdings from</span>
          {DATA_SOURCES.map((s) => (
            <span key={s} className="text-[14px] font-semibold tracking-[0.02em] text-fg/55 uppercase sm:text-[15px]">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
