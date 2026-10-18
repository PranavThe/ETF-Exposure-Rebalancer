import Link from "next/link";

import BrandLogo from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";

import { FrameDivider } from "./Frame";
import { API_DOCS, DISCLAIMER, GITHUB, LAUNCH_APP, METHODOLOGY } from "./links";
import SiteLinkItem from "./SiteLinkItem";

// Ruler ticks: dense at the edges, widest in the middle (x = sin of an even spread).
// Minor half-height ticks only where the gap is wide enough to read.
const TICKS = Array.from({ length: 33 }, (_, i) => {
  const t = -1 + (2 * i) / 32;
  return 500 + 500 * Math.sin((Math.PI / 2) * t);
}).filter((x) => x > 0.5 && x < 999.5);
const MINOR = TICKS.slice(1)
  .map((x, i) => ({ x: (x + TICKS[i]) / 2, gap: x - TICKS[i] }))
  .filter((m) => m.gap > 30)
  .map((m) => m.x);

function Ruler() {
  return (
    <svg aria-hidden viewBox="0 0 1000 28" preserveAspectRatio="none" className="block h-7 w-full text-line-2">
      {TICKS.map((x) => (
        <line key={x} x1={x} x2={x} y1={0} y2={28} stroke="currentColor" vectorEffect="non-scaling-stroke" />
      ))}
      {MINOR.map((x) => (
        <line key={`m${x}`} x1={x} x2={x} y1={18} y2={28} stroke="currentColor" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

const COLUMNS = [
  { heading: "Product", links: [LAUNCH_APP, METHODOLOGY] },
  { heading: "Developers", links: [API_DOCS, GITHUB] },
];

export default function SiteFooter() {
  return (
    <footer>
      <FrameDivider />
      <div className="grid grid-cols-1 gap-10 px-5 pt-14 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto] lg:px-14">
        <div className="max-w-[420px]">
          <Link
            href="/"
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`${BRAND} home`}
          >
            <BrandLogo width={168} />
          </Link>
          <p className="mt-4 text-[14px] leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
        <div className="flex gap-16">
          {COLUMNS.map((c) => (
            <div key={c.heading}>
              <div className="label">{c.heading}</div>
              <ul className="mt-4 space-y-3 text-[14px]">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <SiteLinkItem link={l} className="text-fg/75 transition-colors hover:text-fg" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden px-5 pt-20 pb-6 sm:px-8 sm:pt-28 lg:px-14">
        <p
          aria-hidden
          className="site-fade-text pb-[0.1em] text-[clamp(48px,7.6vw,150px)] leading-[0.95] font-light tracking-[-0.045em]"
        >
          Your mix, your call.
        </p>
      </div>
      <Ruler />
    </footer>
  );
}
