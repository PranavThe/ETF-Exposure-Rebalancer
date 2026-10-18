import Link from "next/link";

import { BRAND } from "@/lib/brand";

import Accordion from "./Accordion";
import { TagPill } from "./Frame";
import { API_DOCS, DISCLAIMER, GITHUB, METHODOLOGY } from "./links";
import Reveal from "./Reveal";
import SiteLinkItem from "./SiteLinkItem";

const ITEMS = [
  {
    title: `What is ${BRAND}?`,
    body: (
      <p>
        {BRAND} shows how an actively managed ETF&apos;s holdings changed between two issuer-published snapshots. Every
        weight change is split into a price effect, what market moves alone would have done, and portfolio activity,
        the part that comes from different share counts. Events explain each material change and link back to the
        source files.
      </p>
    ),
  },
  {
    title: "Which funds does it cover?",
    body: (
      <p>
        Fund coverage depends on which issuer or regulatory holdings files have been loaded. The ETF catalog is larger
        than the set of funds with available holdings, and each fund page shows the dates and sources of its stored
        snapshots.
      </p>
    ),
  },
  {
    title: "What is the difference between price effect and portfolio activity?",
    body: (
      <p>
        The price effect is how a weight would have moved if the earlier share counts had simply been carried to the
        later prices: the counterfactual. Portfolio activity is everything else, the change that comes from different
        share counts. The two always add up to the total change.
      </p>
    ),
  },
  {
    title: "How are creations and redemptions handled?",
    body: (
      <p>
        When investors create or redeem ETF shares, the fund scales every position together. {BRAND} measures that with
        a flow factor, the median ratio of later to earlier share counts across holdings present in both snapshots, and
        divides it out before calling a position increased or decreased.
      </p>
    ),
  },
  {
    title: "Is this investment advice?",
    body: (
      <p>
        No. {BRAND} describes what changed in published holdings. It does not recommend any security or fund, and it
        does not claim to know why a manager made a change. {DISCLAIMER}
      </p>
    ),
  },
];

export default function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="grid grid-cols-1 gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:min-h-[760px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16 lg:px-14 lg:py-40"
    >
      <Reveal>
        <TagPill>FAQ</TagPill>
        <h2 id="faq-heading" className="mt-6 max-w-[11ch] text-[34px] leading-[1.1] font-light tracking-[-0.02em] text-fg sm:text-[40px]">
          Frequently asked questions
        </h2>
        <p className="mt-6 max-w-[380px] text-[15px] leading-relaxed text-muted">
          More detail, including every threshold, is on the{" "}
          <Link href={METHODOLOGY.href} className="text-fg underline decoration-line-2 underline-offset-4 hover:decoration-fg">
            methodology page
          </Link>
          .
        </p>
      </Reveal>
      <Reveal delay={100}>
        <Accordion items={ITEMS} defaultOpen={null} size="lg" headingLevel={3} />
        <nav aria-label="Further reading" className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
          {[METHODOLOGY, API_DOCS, GITHUB].map((l) => (
            <SiteLinkItem
              key={l.label}
              link={l}
              className="font-mono text-[12px] tracking-[0.06em] text-faint uppercase transition-colors hover:text-fg"
            />
          ))}
        </nav>
      </Reveal>
    </section>
  );
}
