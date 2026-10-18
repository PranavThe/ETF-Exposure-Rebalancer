import Link from "next/link";

import { BRAND } from "@/lib/brand";

import Accordion from "./Accordion";
import { TagPill } from "./Frame";
import { API_DOCS, DISCLAIMER, GITHUB, METHODOLOGY } from "./links";
import Reveal from "./Reveal";
import SiteLinkItem from "./SiteLinkItem";

const ITEMS = [
  {
    title: "Is this investment advice?",
    body: (
      <p>
        No. {BRAND} shows what your ETFs hold and works out moves toward a mix that you choose. It never suggests what
        mix you should want, which ETFs are good, or where markets are going. Whether and how you act is up to you.{" "}
        {DISCLAIMER}
      </p>
    ),
  },
  {
    title: "Does the assistant decide my mix?",
    body: (
      <p>
        No. The assistant, Claude, only turns your words into numbers: &ldquo;less tech, more health care&rdquo; becomes
        a target mix you can see and change. Ask it which sector is best and it will tell you the choice is yours. The
        sliders do everything without it.
      </p>
    ),
  },
  {
    title: "Where does the data come from?",
    body: (
      <p>
        From holdings files that fund issuers publish, currently ARK Invest and iShares, and from the holdings that
        funds report to the SEC in N-PORT filings. Each ETF uses its most recent stored snapshot, so what you see is
        usually a day or more behind, and N-PORT holdings can be a few months old.
      </p>
    ),
  },
  {
    title: "Why is my ETF missing or flagged?",
    body: (
      <p>
        You can add any of thousands of U.S.-listed ETFs, but holdings data is loaded for only some of them so far. An
        ETF without holdings data stays in your list, is clearly flagged, and is left out of the math, so your sector
        mix describes only the part {BRAND} can see.
      </p>
    ),
  },
  {
    title: "Do I need an account?",
    body: (
      <p>
        No. Your portfolio saves to its own link, with no name or email. The private key that lets you change it is
        kept in this browser. Anyone you share the link with can see the portfolio, but only a browser with the key can
        edit it.
      </p>
    ),
  },
  {
    title: "Does it account for taxes, fees or trading costs?",
    body: (
      <p>
        No. Reducing an ETF can mean a tax bill, and moving money can come with costs. {BRAND} leaves all of that out,
        so weigh it yourself before you make any change.
      </p>
    ),
  },
  {
    title: "What does “pp” mean?",
    body: (
      <p>
        Percentage points: the plain difference between two percentages. If Technology goes from 52.6% to 47.6% of your
        portfolio, that is &minus;5.0 pp. Saying &ldquo;&minus;5%&rdquo; would mean something else: 5% of 52.6%.
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
          Every rule the sector mix and the plans follow, with formulas and thresholds, is on the{" "}
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
