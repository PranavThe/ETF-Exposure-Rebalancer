import { BRAND } from "@/lib/brand";

import { TagPill } from "./Frame";
import Reveal from "./Reveal";

const STEPS = [
  {
    title: "Add your ETFs",
    body: "Type each ETF you hold and how many dollars are in it. Round numbers are fine.",
    example: "IVV $6,000 · IYW $3,000 · ARKK $1,000",
  },
  {
    title: "See your sector mix",
    body: `${BRAND} uses each covered ETF's latest selected holdings and blends them by your dollars, so you see the part of your mix it can calculate.`,
    example: "Technology 52.6%",
  },
  {
    title: "Say the mix you want, get the moves",
    body: "Drag the sliders or say it in plain words. You get a short list of moves to get there: add, increase or reduce.",
    example: "“less tech, more health care”",
  },
];

/** Three numbered steps in a row, divided by the frame's hairlines. */
export default function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="scroll-mt-16 px-5 py-20 sm:px-8 sm:py-28 lg:px-14 lg:py-32">
      <Reveal className="max-w-[620px]">
        <TagPill>How it works</TagPill>
        <h2 id="how-heading" className="mt-6 text-[32px] leading-[1.1] font-light tracking-[-0.02em] text-fg sm:text-[38px]">
          Three steps, one screen
        </h2>
        <p className="mt-6 text-[16px] leading-[1.6] text-muted sm:text-[17px]">
          No account and no jargon. You say what you want; {BRAND} does the arithmetic.
        </p>
      </Reveal>

      <ol className="mt-14 grid grid-cols-1 border-t border-line md:grid-cols-3 lg:mt-20">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="border-b border-line py-8 md:border-b-0 md:py-10 md:pr-8 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:pl-8 lg:pr-10 lg:[&:not(:first-child)]:pl-10"
          >
            <Reveal delay={i * 100} className="flex h-full flex-col">
              <span className="font-mono text-[12px] tracking-[0.06em] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 text-[22px] leading-[1.2] font-light tracking-[-0.01em] text-fg sm:text-[24px]">
                {step.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{step.body}</p>
              <div className="mt-auto pt-6">
                <p className="w-fit border border-line bg-panel px-2.5 py-1.5 font-mono text-[12px] text-fg/80">{step.example}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
