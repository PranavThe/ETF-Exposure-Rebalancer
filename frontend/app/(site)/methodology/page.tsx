import type { Metadata } from "next";
import Link from "next/link";

import { FrameDivider, TagPill } from "@/components/site/Frame";
import { LaunchButton } from "@/components/site/Hero";
import { ARK_CSV_URL, DISCLAIMER } from "@/components/site/links";
import MethodologyToc, { type TocEntry } from "@/components/site/MethodologyToc";
import { Bullets, C, DocSection, DocTable, Formula, Term } from "@/components/site/Prose";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Methodology · ${BRAND}`,
  description: `How ${BRAND} works out the sector mix inside your ETFs, measures the distance to the mix you want, and finds the moves that get you there: formulas, rules and data sources.`,
};

const SECTIONS: TocEntry[] = [
  { id: "overview", title: "The short version" },
  { id: "units", title: "Percent and pp" },
  { id: "etf-mix", title: "An ETF's sector mix" },
  { id: "portfolio-mix", title: "Your portfolio's mix" },
  { id: "distance", title: "Distance to your target" },
  { id: "plans", title: "How plans are found" },
  { id: "assistant", title: "The assistant" },
  { id: "sources", title: "Data sources and freshness" },
  { id: "saving", title: "Saving without an account" },
  { id: "limitations", title: "Limitations" },
];

const n = (id: string) => SECTIONS.findIndex((s) => s.id === id) + 1;
const t = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

// Mirrors backend/analytics/rebalance.py.
const PLANNER_CONFIG = `MAX_NEW_ETFS   = 2        # new ETFs per plan
SHORTLIST_SIZE = 12       # candidate new ETFs considered per plan
MIN_POSITION   = 0.01     # 1% of the portfolio
MIN_GAIN       = 0.005    # 0.5 pp closer to the target`;

export default function MethodologyPage() {
  return (
    <article>
      <header className="relative overflow-hidden px-5 pt-20 pb-16 sm:px-8 sm:pt-28 sm:pb-20 lg:px-14">
        <div
          aria-hidden
          className="site-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_55%_80%_at_85%_20%,#000_10%,transparent_70%)]"
        />
        <div className="relative">
          <TagPill>Methodology</TagPill>
          <h1 className="site-gradient-text mt-6 max-w-[900px] pb-[0.08em] text-[44px] leading-[1.04] font-light tracking-[-0.035em] sm:text-[60px] lg:text-[72px]">
            How the numbers work
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.65] text-muted sm:text-[17px]">
            {BRAND} looks inside the ETFs you hold, adds up your <Term>sector mix</Term>, and works out{" "}
            <Term>moves</Term> toward the mix you choose. This page explains every step, rule and threshold, in plain
            words first and formulas after.
          </p>
          <ul className="mt-10 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.04em] text-muted uppercase">
            {["Latest holdings per ETF", "Dollar-weighted", "Weights in %, differences in pp", "Up to 2 new ETFs"].map(
              (x) => (
                <li key={x} className="border border-line px-2.5 py-1.5">
                  {x}
                </li>
              ),
            )}
          </ul>
        </div>
      </header>

      <FrameDivider />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-line lg:block">
          <div className="sticky top-[65px] px-8 pt-12 pb-10">
            <MethodologyToc entries={SECTIONS} />
          </div>
        </aside>

        <div className="min-w-0 px-5 pt-10 pb-20 sm:px-8 lg:px-16 lg:pt-14">
          <details className="mb-10 rounded-md border border-line bg-panel lg:hidden">
            <summary className="cursor-pointer px-4 py-3 font-mono text-[12px] tracking-[0.06em] text-fg/85 uppercase">
              On this page
            </summary>
            <ol className="border-t border-line px-4 py-3 text-[14px]">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex gap-3 py-1.5 text-muted hover:text-fg">
                    <span className="font-mono text-[11px] leading-6 text-faint">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          <div className="max-w-[760px]">
            <DocSection id="overview" index={n("overview")} title={t("overview")}>
              <Bullets>
                <li>
                  You enter the ETFs you hold and the dollars in each, for example IVV $6,000, IYW $3,000 and ARKK
                  $1,000.
                </li>
                <li>
                  Each ETF&apos;s latest published holdings are grouped by sector, by market value. Your{" "}
                  <Term>sector mix</Term> is those ETF mixes blended by your dollars.
                </li>
                <li>
                  You set a <Term>target mix</Term> with sliders, or in plain words that the assistant turns into
                  numbers. The target is always yours: {BRAND} never suggests one.
                </li>
                <li>
                  {BRAND} finds <Term>plans</Term>: the closest mix it can reach using only the moves each plan allows.
                  Every plan shows how close it gets and how much money moves.
                </li>
              </Bullets>
            </DocSection>

            <DocSection id="units" index={n("units")} title={t("units")}>
              <Bullets>
                <li>
                  <Term>Weights</Term>, how much of something sits in a sector, are shown in %: Technology 52.6%.
                </li>
                <li>
                  <Term>Differences</Term> between two weights are shown in percentage points, <Term>pp</Term>: going
                  from 52.6% to 47.6% is &minus;5.0 pp, never &ldquo;&minus;5%&rdquo; (which would mean 5% of 52.6%).
                  Distances are in pp too.
                </li>
                <li>Money is in dollars, and plan amounts are whole dollars.</li>
              </Bullets>
              <p>
                Behind the scenes every weight is a fraction (<C>0.526</C> means 52.6%), computed at full precision and
                rounded only for display, so a column of rounded weights may not add up to exactly 100.0%.
              </p>
            </DocSection>

            <DocSection id="etf-mix" index={n("etf-mix")} title={t("etf-mix")}>
              <p>
                Each ETF uses its <Term>latest stored holdings snapshot</Term>. Every holding is put in a sector, and a
                sector&apos;s weight is the market value of its holdings over the ETF&apos;s total market value. Only
                rows with a positive market value count.
              </p>
              <Formula label="ETF sector mix">{`etf_mix[s] = Σ market value of holdings in sector s
             ÷ Σ market value of all holdings

(holdings with a positive market value only)`}</Formula>
              <p>
                A holding&apos;s sector comes from a maintained reference list for that security, then from the
                issuer&apos;s own sector column, then <Term>Unclassified</Term>. Issuers spell sectors differently, so
                their labels are mapped to the 11 standard sectors. Anything that isn&apos;t a stock, such as cash,
                money-market funds, futures or warrants, goes to <Term>Cash &amp; other</Term>.
              </p>
              <DocTable
                head={["Sector", "Issuer labels mapped to it"]}
                rows={[
                  ["Technology", "Information Technology, Technology"],
                  ["Health Care", "Health Care, Healthcare"],
                  ["Financials", "Financials, Financial"],
                  ["Consumer Discretionary", "Consumer Discretionary, Consumer Cyclical"],
                  ["Consumer Staples", "Consumer Staples, Consumer Defensive"],
                  ["Communication Services", "Communication Services, Communications, Telecommunications"],
                  ["Industrials", "Industrials"],
                  ["Energy", "Energy"],
                  ["Utilities", "Utilities"],
                  ["Materials", "Materials, Basic Materials"],
                  ["Real Estate", "Real Estate"],
                  ["Cash & other", "Every row that isn't a stock, and “Cash and/or Derivatives”"],
                  ["Unclassified", "Stocks with no sector label from any source"],
                ]}
              />
            </DocSection>

            <DocSection id="portfolio-mix" index={n("portfolio-mix")} title={t("portfolio-mix")}>
              <p>
                Your portfolio&apos;s mix is the <Term>dollar-weighted blend</Term> of your ETFs&apos; mixes: each
                ETF&apos;s sector weights times the dollars in it, over the total. ETFs without holdings data are left
                out, so the mix describes the part of your money that {BRAND} can see.
              </p>
              <Formula label="Your sector mix">{`your_mix[s] = Σ  dollars[etf] × etf_mix[etf][s]
              ÷ Σ  dollars[etf]

(ETFs with holdings data only)`}</Formula>
              <p>
                Example, with IVV $6,000, IYW $3,000 and ARKK $1,000 (60%, 30% and 10% of the money) and the holdings
                files of October 15&ndash;16, 2026:
              </p>
              <Formula label="Technology, worked out">{`Technology = 0.6 × 38.3%   (IVV)
           + 0.3 × 90.3%   (IYW)
           + 0.1 × 24.9%   (ARKK)
           = 23.0% + 27.1% + 2.5%  =  52.6%`}</Formula>
            </DocSection>

            <DocSection id="distance" index={n("distance")} title={t("distance")}>
              <p>
                The <Term>distance</Term> between your mix and your target is half the sum of the absolute differences,
                sector by sector. It reads as the share of your portfolio sitting in a different sector than you want:
                0.0 pp is a perfect match, and 100 pp would mean none of it is where you want it.
              </p>
              <Formula label="Distance">{`distance = ½ × Σ | your_mix[s] − target[s] |`}</Formula>
              <p>
                Example: Technology 52.6% with a target of 47.6%, and Health Care 8.4% with a target of 13.4%, give ½ ×
                (5.0 + 5.0) = 5.0 pp. Five cents of every dollar sit in a different sector than you want.
              </p>
            </DocSection>

            <DocSection id="plans" index={n("plans")} title={t("plans")}>
              <p>
                A plan is a new dollar amount for each ETF. Which moves a plan may use depends on whether you are adding
                money, taking money out, or neither; each situation gets two plans.
              </p>
              <DocTable
                head={["Situation", "Plan", "Allowed moves"]}
                rows={[
                  ["No money in or out", "Rearrange the ETFs you own", "Increase and reduce the ETFs you hold"],
                  ["", "Rearrange and add new ETFs", "The same, plus add up to 2 new ETFs"],
                  [
                    "Adding money",
                    "Invest without reducing anything",
                    "Increase ETFs you hold or add up to 2 new ones; every ETF you hold stays at least where it is",
                  ],
                  ["", "Invest and rearrange", "Any of the moves, with up to 2 new ETFs"],
                  ["Taking money out", "Take out only by reducing", "Reduce ETFs you hold; nothing is increased or added"],
                  ["", "Take out and rearrange", "Any of the moves, with up to 2 new ETFs"],
                ]}
              />
              <p>
                If you hold nothing yet and add money, there is one plan, which picks up to 2 ETFs. Each plan is built
                in the same steps:
              </p>
              <Bullets>
                <li>
                  <Term>Shortlist.</Term> ETFs with holdings data that you don&apos;t hold are scored by how well their
                  sector mix points toward what your portfolio is missing. The top 12 are the candidates.
                </li>
                <li>
                  <Term>Closest mix.</Term> For a set of ETFs, {BRAND} finds the split of your money whose mix is
                  closest to your target within the plan&apos;s rules. &ldquo;Closest&rdquo; here means the smallest sum
                  of squared sector differences, which prefers several small misses to one big one. When two splits are
                  equally close, the one with smaller moves wins.
                </li>
                <li>
                  <Term>New ETFs, one at a time.</Term> The candidate that helps most is added first, then the next. Each
                  joins only if it brings the plan at least 0.5 pp closer to your target, and a plan adds at most 2.
                </li>
                <li>
                  <Term>No slivers.</Term> A new ETF that would end up under 1% of the portfolio is dropped and the plan
                  is worked out again. In plans that may both increase and reduce, an ETF you hold that would end up
                  under 1% is removed rather than kept as a sliver.
                </li>
                <li>
                  <Term>Whole dollars.</Term> Amounts are rounded to whole dollars, changes under $1 are skipped, and any
                  rounding leftover goes to the largest move.
                </li>
              </Bullets>
              <p>
                Each plan lists its moves as <Term>add</Term>, <Term>increase</Term>, <Term>reduce</Term> or{" "}
                <Term>remove</Term> (reduce to zero), the distance before and after, and the money moved out of your
                current holdings. If two plans come out the same, for example because no new ETF helps, only one is
                shown. ETFs you hold without holdings data are never part of a plan; they stay exactly as they are.
              </p>
              <Formula label="backend/analytics/rebalance.py">{PLANNER_CONFIG}</Formula>
            </DocSection>

            <DocSection id="assistant" index={n("assistant")} title={t("assistant")}>
              <p>
                The assistant is Claude, a model made by Anthropic. Its only job is to turn what you type into a
                target mix and, when you mention one, an amount of money you&apos;re adding or taking out. The plans
                themselves always come from the math above, never from the model.
              </p>
              <Bullets>
                <li>
                  It starts from your current target, or your current mix if you haven&apos;t set one, changes only
                  what you asked for, and spreads any difference over the other sectors in proportion to their size, so
                  the total stays 100%.
                </li>
                <li>
                  Everyday words are read as rough sizes: &ldquo;a bit&rdquo; is about 3 pp, &ldquo;more&rdquo; or
                  &ldquo;less&rdquo; about 5 pp, &ldquo;a lot&rdquo; about 10 pp, and &ldquo;no energy&rdquo; means
                  0%. It always shows the result, so you can adjust it.
                </li>
                <li>
                  It never suggests what mix you should want, never says a sector is a good or bad idea, and never
                  predicts markets. Asked for advice, it says the choice is yours and offers to explain what a sector
                  contains.
                </li>
                <li>
                  It sees your current sector mix, your target, your portfolio&apos;s total value and the last few
                  messages, nothing else: not which ETFs you hold, and nothing about who you are.
                </li>
              </Bullets>
              <p>
                The sliders work without the assistant. If Claude isn&apos;t available, a simple built-in reader still
                handles plain requests such as &ldquo;less tech&rdquo;, &ldquo;no energy&rdquo; or &ldquo;30% health
                care&rdquo;.
              </p>
            </DocSection>

            <DocSection id="sources" index={n("sources")} title={t("sources")}>
              <DocTable
                head={["Source", "What it gives", "How fresh"]}
                rows={[
                  [
                    "ARK Invest holdings file",
                    "Every holding with shares and market value. Sectors come from the reference list.",
                    "The latest market day when fetched",
                  ],
                  [
                    "iShares holdings files",
                    "Every holding with market value and the issuer's own sector",
                    "The latest market day when fetched",
                  ],
                  [
                    "SEC N-PORT filings",
                    "Holdings that funds report to the SEC, for many more ETFs. No sector field.",
                    "Published with a delay; can be a few months old",
                  ],
                  ["Nasdaq symbol directories", "The list of U.S.-listed ETFs you can search", "No holdings"],
                ]}
              />
              <p>
                Each ETF uses its own newest snapshot, so ETFs in one portfolio can have different dates, and two
                sources are never mixed inside one snapshot. Issuer files describe the previous market day at best, so
                expect a lag of a day or more. ARK&apos;s file is read from:
              </p>
              <Formula>{ARK_CSV_URL}</Formula>
              <p>
                Every file is checked row by row before it is stored, and each snapshot keeps its source address, date
                and a fingerprint of its contents. The searchable ETF list is much larger than the set with holdings:
                an ETF without holdings data can be added to your portfolio, but it is flagged and left out of the math.
              </p>
            </DocSection>

            <DocSection id="saving" index={n("saving")} title={t("saving")}>
              <p>
                There are no accounts. When you save, your ETFs, amounts and target are stored under a random link, and
                you get a private <Term>edit key</Term> that stays in this browser. The server keeps only a fingerprint
                of the key, never the key itself.
              </p>
              <Bullets>
                <li>Anyone with the link can see the saved portfolio.</li>
                <li>Only a browser holding the edit key can change or delete it.</li>
                <li>If you clear this browser&apos;s site data, the key goes with it and the portfolio can no longer be changed.</li>
              </Bullets>
            </DocSection>

            <DocSection id="limitations" index={n("limitations")} title={t("limitations")}>
              <Bullets>
                <li>
                  Taxes, fees, trading costs and bid-ask spreads are not considered. Reducing an ETF can have tax
                  consequences.
                </li>
                <li>
                  Holdings lag by a day or more (N-PORT by months), and funds change their holdings over time, so your
                  real mix today can differ.
                </li>
                <li>ETFs without holdings data are flagged and kept out of the mix and the plans.</li>
                <li>
                  Sector labels come from issuers and a reference list, not one official classification across all
                  sources. ARK&apos;s sectors are assigned by the team; N-PORT holdings may be Unclassified.
                </li>
                <li>
                  The mix is by sector only. It says nothing about company size, country, or whether two ETFs hold the
                  same companies within a sector.
                </li>
                <li>
                  Plans are in dollars, not shares, and don&apos;t check minimums or whole-share rules. They only use
                  ETFs that have holdings data.
                </li>
              </Bullets>
              <p className="rounded-md border border-line bg-panel px-4 py-3 text-[15px] text-fg/85">{DISCLAIMER}</p>
            </DocSection>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-5 border-t border-line pt-12">
              <LaunchButton />
              <Link
                href="/"
                className="font-mono text-[12px] tracking-[0.06em] text-fg/60 uppercase transition-colors hover:text-fg"
              >
                ← Back to overview
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
