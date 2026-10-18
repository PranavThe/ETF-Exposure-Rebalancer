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
  { id: "assistant", title: "Scythe, the assistant" },
  { id: "sources", title: "Data sources and freshness" },
  { id: "saving", title: "Saving without an account" },
  { id: "limitations", title: "Limitations" },
];

const n = (id: string) => SECTIONS.findIndex((s) => s.id === id) + 1;
const t = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

// Mirrors backend/analytics/rebalance.py (max_new_funds is build_plans' default; the app lets you change it).
const PLANNER_CONFIG = `SHORTLIST_SIZE = 12       # candidate new ETFs considered per plan
MIN_POSITION   = 0.01     # 1% of the portfolio
MIN_GAIN       = 0.005    # 0.5 pp per newly added ETF
max_new_funds  = 2        # default limit on new ETFs per plan`;

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
            {["Latest holdings per ETF", "Dollar-weighted", "Weights in %, differences in pp", "Whole-dollar moves"].map(
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
                  Each covered ETF&apos;s selected stored holdings are grouped by sector, using reported market values
                  or provider weights. Your{" "}
                  <Term>sector mix</Term> is those ETF mixes blended by your dollars.
                </li>
                <li>
                  You set a <Term>target mix</Term> with sliders, or in plain words that Scythe, the assistant, turns into
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
                Each ETF uses one selected stored holdings snapshot. For issuer and SEC files, each holding is put in
                a sector and counted by its positive market value. TickerInside snapshots provide weights instead of
                market values; their positive weights are grouped by sector and normalized to 100%.
              </p>
              <Formula label="ETF sector mix">{`etf_mix[s] = Σ market value of holdings in sector s
             ÷ Σ market value of all holdings

(issuer/SEC holdings with a positive market value only)`}</Formula>
              <Formula label="TickerInside sector mix">{`etf_mix[s] = Σ positive reported weights in sector s
             ÷ Σ positive reported weights in the selected snapshot`}</Formula>
              <p>
                A holding&apos;s sector comes from a maintained reference list for that security, then from the
                issuer&apos;s own sector column. If neither resolves it, the planner uses a company-name reference,
                then the sector of the same security in another eligible ETF. Remaining gaps are
                <Term>Unclassified</Term>. For TickerInside weights, the planner first uses a matching ticker&apos;s sector
                from stored issuer/SEC equity holdings, then a ticker-sector reference, where a U.S. listing wins over a
                foreign exchange code with the same letters; unknown symbols remain unclassified. Issuers spell sectors differently, so known labels are mapped
                to standard sectors. Non-equity rows in issuer and SEC files, such as cash, money-market funds,
                futures or warrants, go to <Term>Cash &amp; other</Term>.
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
                A plan is a new dollar amount for each ETF, using the money already in your ETFs: the total stays the
                same. There are two plan types, though Glean shows only those that improve the match and make a
                distinct move.
              </p>
              <DocTable
                head={["Plan", "Allowed moves"]}
                rows={[
                  ["Rearrange what you own", "Increase and reduce the ETFs you hold"],
                  ["Add new ETFs", "The same, plus add new ETFs"],
                ]}
              />
              <p>
                You choose how many new ETFs a plan may add; the default is 2. To plan with more or less money, change
                the dollar amounts in your holdings. Each plan is built in the same steps:
              </p>
              <Bullets>
                <li>
                  <Term>Shortlist.</Term> Only plain, widely held index and sector ETFs (from SPDR, Vanguard, iShares
                  and similar) whose holdings are at least 80% classified can be suggested. Those you don&apos;t hold are
                  scored by how well their sector mix points toward what your portfolio is missing; the top 12 are the
                  candidates.
                </li>
                <li>
                  <Term>Only plain ETFs get more money.</Term> An ETF you hold that isn&apos;t on that list, such as a
                  thematic or active fund, still counts in your mix and can be kept or reduced, but no plan increases it.
                </li>
                <li>
                  <Term>Closest mix.</Term> For a set of ETFs, {BRAND} finds the split of your money whose mix is
                  closest to your target within the plan&apos;s rules. &ldquo;Closest&rdquo; here means the smallest sum
                  of squared sector differences, which prefers several small misses to one big one. When two splits are
                  equally close, the one with smaller moves wins.
                </li>
                <li>
                  <Term>New ETFs, one at a time.</Term> The candidate that helps most is added first, then the next. Each
                  joins only if it brings the plan at least 0.5 pp closer to your target, and no plan goes over your limit.
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
                Scythe uses Google&apos;s Gemini, or a basic reader when Gemini is unavailable. Gemini only reads
                what you want changed (&ldquo;Technology &minus;5 pp&rdquo;, &ldquo;Energy to 0%&rdquo;, &ldquo;no
                sector above 20%&rdquo;); Glean&apos;s own code does every calculation. The plans themselves always
                come from the math above, never from the model, and they always use the money already in your ETFs.
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
                  Gemini receives your message, recent chat turns, current sector mix, target and portfolio total
                  when enabled. Glean does not automatically send your ETF list or account identity to it; text you
                  choose to type in a message is included.
                </li>
              </Bullets>
              <p>
                The sliders work without Scythe. If Gemini isn&apos;t available, a simple built-in reader still
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
                  [
                    "TickerInside holdings",
                    "Reported holding weights, without shares or per-holding market values",
                    "The date reported by the provider; an added fund can trigger a lookup",
                  ],
                  [
                    "Alpaca IEX closes",
                    "Stored daily prices shown alongside provider holdings; not used to weight sector mixes",
                    "Refreshed after market close on weekdays when the scheduled sync is configured",
                  ],
                  ["Nasdaq symbol directories", "The list of U.S.-listed ETFs you can search", "No holdings"],
                ]}
              />
              <p>
                Each ETF uses its latest stored issuer/SEC snapshot unless a TickerInside snapshot is the only
                available source, or is strictly newer and assigns a sector to as much of the fund (or at least 80% of
                it). ETFs in one portfolio can have different dates, and sources are not
                mixed inside one fund&apos;s selected snapshot. Issuer files describe the previous market day at best;
                SEC filings can be older. When you add a fund, the app tries a bounded TickerInside lookup if none is
                stored. ARK&apos;s file is read from:
              </p>
              <Formula>{ARK_CSV_URL}</Formula>
              <p>
                Issuer and SEC files are checked before storage, and each snapshot keeps its source address, date
                and a fingerprint of its contents. The searchable ETF list is much larger than the set with holdings:
                an ETF without holdings data can be added to your portfolio, but it is flagged and left out of the math.
              </p>
            </DocSection>

            <DocSection id="saving" index={n("saving")} title={t("saving")}>
              <p>
                There are no accounts. Your ETFs, amounts and target save automatically under a random link, and this
                browser keeps a private <Term>edit key</Term> for it. The server stores only a fingerprint of the key,
                never the key itself.
              </p>
              <Bullets>
                <li>Anyone with the link can see the saved portfolio.</li>
                <li>Only a browser holding the edit key can change or delete it.</li>
                <li>Opening someone else&apos;s link and making changes saves them as your own copy.</li>
                <li>If you clear this browser&apos;s site data, the key goes with it and the portfolio can no longer be changed.</li>
              </Bullets>
            </DocSection>

            <DocSection id="limitations" index={n("limitations")} title={t("limitations")}>
              <Bullets>
                <li>
                  Taxes, fees, transaction costs and bid-ask spreads are not considered. Reducing an ETF can have tax
                  consequences.
                </li>
                <li>
                  Holdings can lag by a day or more (N-PORT by months), and funds change their holdings over time, so
                  your real mix today can differ. Stored IEX closes are daily, not live prices.
                </li>
                <li>ETFs without holdings data are flagged and kept out of the mix and the plans.</li>
                <li>
                  Sector labels come from issuers and maintained references, not one official classification across
                  all sources. ARK&apos;s sectors are assigned by the team; unresolved N-PORT and TickerInside holdings
                  may be Unclassified. IEX closes may differ from consolidated market prices.
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
