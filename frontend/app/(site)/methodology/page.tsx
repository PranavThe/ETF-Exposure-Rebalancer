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
  description: `How ${BRAND} splits each weight change in an active ETF into price effect and portfolio activity: formulas, rules, thresholds and data sources.`,
};

const SECTIONS: TocEntry[] = [
  { id: "units", title: "Units" },
  { id: "vectors", title: "Three weight vectors" },
  { id: "decomposition", title: "Price effect and portfolio activity" },
  { id: "flow", title: "Flow factor" },
  { id: "splits", title: "Suspected corporate actions" },
  { id: "status", title: "Position status" },
  { id: "dilution", title: "Dilution" },
  { id: "sectors", title: "Sectors" },
  { id: "concentration", title: "Concentration" },
  { id: "events", title: "Events and thresholds" },
  { id: "caveats", title: "Caveats" },
  { id: "sources", title: "Data sources" },
  { id: "limitations", title: "Known limitations" },
];

const n = (id: string) => SECTIONS.findIndex((s) => s.id === id) + 1;
const t = (id: string) => SECTIONS.find((s) => s.id === id)?.title ?? id;

// Mirrors backend/analytics/config.py (CONFIG_VERSION "1").
const CONFIG = `CONFIG_VERSION              = "1"
POSITION_SHARE_THRESHOLD    = 0.05     # 5% flow-adjusted share change
POSITION_ACTIVITY_THRESHOLD = 0.001    # 0.1 pp of portfolio activity
SECTOR_DRIFT_THRESHOLD      = 0.01     # 1.0 pp
CONCENTRATION_THRESHOLD     = 0.01     # 1.0 pp
TOP_N                       = 10       # DEMO uses 2
MIN_FLOW_SECURITIES         = 3
SPLIT_RATIOS                = (2, 3, 4, 5, 10, 20)
SPLIT_RATIO_TOLERANCE       = 0.01     # 1%
SPLIT_PRICE_TOLERANCE       = 0.10     # 10%`;

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
            {BRAND} compares two issuer-published holdings snapshots of the same fund, A (earlier) and B (later), and
            splits every weight change into a <Term>price effect</Term> and <Term>portfolio activity</Term>. This page
            lists every formula, rule and threshold the comparison uses.
          </p>
          <ul className="mt-10 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.04em] text-muted uppercase">
            {["Config version 1", "Fractions in the API", "Equity rows only", "Deterministic event IDs"].map((x) => (
              <li key={x} className="border border-line px-2.5 py-1.5">
                {x}
              </li>
            ))}
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
            <DocSection id="units" index={n("units")} title={t("units")}>
              <p>
                Every weight, exposure, drift and effect is a <Term>fraction</Term> in the database and the API:{" "}
                <C>0.07</C> means 7%. Only the interface converts, and it uses two different units on purpose.
              </p>
              <Bullets>
                <li>
                  <Term>Levels</Term> are shown in %: a weight of 30.0%, a top-2 share of 60.0%.
                </li>
                <li>
                  <Term>Differences</Term> between two weights are shown in percentage points, <Term>pp</Term>: a drift
                  of +5.0 pp, never &ldquo;+5%&rdquo;.
                </li>
                <li>
                  A change in a share count is a ratio, not a weight, so it is shown in %: a flow-adjusted share count
                  of +50.0%.
                </li>
              </Bullets>
              <p>
                Everything is computed in float64 and rounded only for display. Only equity rows enter the weights.
                Cash and other non-equity rows are excluded and reported separately as the cash weight.
              </p>
            </DocSection>

            <DocSection id="vectors" index={n("vectors")} title={t("vectors")}>
              <p>
                For snapshots A (earlier) and B (later), each weight vector is normalized over its own equity total.
                Here <C>s</C> is a share count, <C>p</C> a price and <C>mv</C> a market value.
              </p>
              <Formula label="Weight vectors">{`w0[i]  = mv_A[i]  / Σ mv_A       earlier weights
w1[i]  = mv_B[i]  / Σ mv_B       later weights
wcf[i] = mv_cf[i] / Σ mv_cf      counterfactual weights

mv_cf[i] = s_A[i] × p_B[i]       A's share counts at B's prices`}</Formula>
              <p>
                The <Term>counterfactual</Term> <C>wcf</C> is the portfolio the fund would have had at the later date if
                no share count had changed. Three rules complete it:
              </p>
              <Bullets>
                <li>
                  <Term>Removed holdings</Term> (only in A) have no later price, so the earlier price <C>p_A</C> is used
                  and the holding is marked <em>price estimated</em>.
                </li>
                <li>
                  <Term>Added holdings</Term> (only in B) count as 0: nothing was held at the start.
                </li>
                <li>
                  <Term>Suspected splits</Term> use <C>s_A × r</C> instead of <C>s_A</C>, where <C>r</C> is the detected
                  ratio (see {t("splits")}).
                </li>
              </Bullets>
            </DocSection>

            <DocSection id="decomposition" index={n("decomposition")} title={t("decomposition")}>
              <Formula label="Decomposition">{`price_effect[i]    = wcf[i] − w0[i]
activity_effect[i] = w1[i]  − wcf[i]

price_effect + activity_effect = w1 − w0      (always, exactly)`}</Formula>
              <p>
                The price effect is what market moves alone would have done to a weight. Portfolio activity is the rest:
                the part that comes from different share counts. Because both are measured against the same
                counterfactual, they add back to the total change with nothing left over.
              </p>
              <Formula label="Worked example · DEMO, BBB, 2026-10-01 → 2026-10-02">{`A   200 shares × $5 = $1,000 of $4,000   w0  = 25.0%
CF  200 shares × $5 = $1,000 of $4,500   wcf = 22.2%
B   300 shares × $5 = $1,500 of $5,000   w1  = 30.0%

price effect        22.2% − 25.0%  =  −2.8 pp
portfolio activity  30.0% − 22.2%  =  +7.8 pp
total change                          +5.0 pp`}</Formula>
              <p>
                BBB&apos;s own price did not move, yet its price effect is negative: AAA rose 50%, so in the
                counterfactual it takes a bigger share of the portfolio and everything else shrinks.
              </p>
            </DocSection>

            <DocSection id="flow" index={n("flow")} title={t("flow")}>
              <p>
                When investors create or redeem ETF shares, the fund scales every position&apos;s share count together.
                That is not a manager decision, so it is measured and removed before any position is classified.
              </p>
              <Formula label="Flow factor">{`flow_factor         = median( s_B[i] / s_A[i] )      holdings in both, s_A > 0
adj_share_change[i] = (s_B[i] / s_A[i]) / flow_factor − 1`}</Formula>
              <Bullets>
                <li>
                  With fewer than <C>3</C> holdings present in both snapshots, the flow factor falls back to{" "}
                  <C>1.0</C> and a caveat warns that fund flows may show up as portfolio activity.
                </li>
                <li>
                  In the FLOW test fund every share count rises 10%. The flow factor is 1.10, every flow-adjusted share
                  change is 0, and no events fire.
                </li>
              </Bullets>
            </DocSection>

            <DocSection id="splits" index={n("splits")} title={t("splits")}>
              <p>
                A share count that doubles while the price halves is a stock split, not a position change. It is
                flagged as a <Term>suspected corporate action</Term> when both conditions hold:
              </p>
              <Formula label="Split rule">{`r = (s_B / s_A) / flow_factor

flag when   r or 1/r is within 1% of 2, 3, 4, 5, 10 or 20
      and   (p_B / p_A) × r is within 10% of 1`}</Formula>
              <p>
                A flagged holding uses <C>s_A × r</C> in the counterfactual, gets a flow-adjusted share change of 0 and
                the status unchanged, and never produces a position event. A{" "}
                <C>SUSPECTED_CORPORATE_ACTION</C> event and a caveat point to it instead. In the SPLT test fund, FFF
                goes from 100 to 200 shares while its price moves from $50.00 to $25.50: <C>r = 2.00</C> and{" "}
                <C>(25.5 / 50) × 2 = 1.02</C>, so it is a suspected 2-for-1 split.
              </p>
            </DocSection>

            <DocSection id="status" index={n("status")} title={t("status")}>
              <DocTable
                head={["Status", "Rule"]}
                rows={[
                  ["Added", "Only in B"],
                  ["Removed", "Only in A"],
                  ["Increased position", "Flow-adjusted share change ≥ +5%"],
                  ["Decreased position", "Flow-adjusted share change ≤ −5%"],
                  ["Unchanged", "Otherwise, including suspected splits"],
                ]}
              />
              <p>
                An <Term>increased position</Term> or <Term>decreased position</Term> always means a flow-adjusted
                share-count change between two snapshots. It says what changed, not why.
              </p>
            </DocSection>

            <DocSection id="dilution" index={n("dilution")} title={t("dilution")}>
              <p>
                An unchanged holding can still have nonzero portfolio activity. When other positions grow, shrink,
                arrive or leave, its share of the portfolio moves even though its own share count did not. That part is
                labelled <Term>dilution</Term>, never a position change.
              </p>
              <p>
                In DEMO, AAA and DDD are unchanged, yet their portfolio activity is −3.3 pp and −2.2 pp: BBB was
                increased, CCC removed and EEE added around them.
              </p>
            </DocSection>

            <DocSection id="sectors" index={n("sectors")} title={t("sectors")}>
              <p>
                Each holding&apos;s sector comes from the reference mapping in <C>data/reference/sectors.csv</C>, then
                the issuer&apos;s own sector column if the file has one, then <C>Unknown</C>. The mapping is applied at
                analysis time to both snapshots, so editing it never shows up as drift. Unknown is a real bucket: it is
                shown like any other sector and raises a caveat.
              </p>
              <Formula label="Per sector">{`drift            = w1 − w0 = price_effect + activity_effect
activity_effect  = activity_direct + activity_dilution

activity_direct    sum over holdings that were added, removed,
                   increased or decreased
activity_dilution  sum over unchanged holdings`}</Formula>
              <p>
                Each sector also reports <C>w0</C>, <C>wcf</C> and <C>w1</C>. In DEMO, Technology&apos;s net drift is
                0.0 pp, but that hides +5.6 pp from price and −5.6 pp of portfolio activity, all of it dilution. The
                sector labels for ARKK are team-assigned categories, not an official classification such as GICS.
              </p>
            </DocSection>

            <DocSection id="concentration" index={n("concentration")} title={t("concentration")}>
              <Formula label="Concentration">{`top_N_share = sum of the N largest weights
HHI         = Σ w[i]²`}</Formula>
              <p>
                Both are computed on <C>w0</C>, <C>wcf</C> and <C>w1</C>, so a change in concentration splits into price
                and portfolio activity like any weight. N is 10, except for DEMO, which uses 2: it has only four
                holdings, so a top-10 share would always be 100%. In DEMO the top-2 share goes from 50.0% to 60.0%:
                +10.0 pp (price +5.6 pp, portfolio activity +4.4 pp).
              </p>
            </DocSection>

            <DocSection id="events" index={n("events")} title={t("events")}>
              <DocTable
                head={["Event", "Fires when", "Magnitude"]}
                rows={[
                  [<C key="a">POSITION_ADDED / _REMOVED</C>, "Always", "Activity effect"],
                  [
                    <C key="i">POSITION_INCREASED / _DECREASED</C>,
                    "|flow-adjusted share change| ≥ 5% and |activity effect| ≥ 0.1 pp",
                    "Activity effect",
                  ],
                  [<C key="s">SECTOR_INCREASE / _DECREASE</C>, "|drift| ≥ 1.0 pp", "Drift"],
                  [<C key="c">CONCENTRATION_INCREASE / _DECREASE</C>, "|top-N share change| ≥ 1.0 pp", "Top-N share change"],
                  [<C key="x">SUSPECTED_CORPORATE_ACTION</C>, "The split rule above", "Ratio r"],
                ]}
              />
              <p>
                Every event carries a plain-language description with its price and portfolio-activity split, following
                one template:
              </p>
              <Formula label="Description template">{`Health Care exposure +5.0 pp (price −2.8 pp, portfolio activity +7.8 pp)`}</Formula>
              <p>
                Event IDs are deterministic. The same fund, dates and config always give the same IDs, so links and
                notes stay valid across re-ingests:
              </p>
              <Formula label="Event ID">{`id = first 16 hex characters of
     sha256("fund|from|to|type|subject|CONFIG_VERSION")`}</Formula>
              <p>
                Contributing holdings are the security itself for position and split events, the sector&apos;s
                holdings ordered by the size of their weight change for sector events, and the top-N holdings in{" "}
                <C>w1</C> for concentration events. All thresholds live in one file, and changing any of them means
                bumping <C>CONFIG_VERSION</C>, which changes every ID:
              </p>
              <Formula label="backend/analytics/config.py">{CONFIG}</Formula>
            </DocSection>

            <DocSection id="caveats" index={n("caveats")} title={t("caveats")}>
              <p>Each comparison returns plain-language caveats, shown next to the results, when:</p>
              <Bullets>
                <li>
                  the range spans more than one stored snapshot interval: changes are netted, and position changes that
                  reversed within the period are invisible;
                </li>
                <li>any holding&apos;s price was estimated (a removed holding has no later price);</li>
                <li>any suspected corporate action was flagged;</li>
                <li>the flow factor fell back to 1.0;</li>
                <li>any weight sits in the Unknown sector.</li>
              </Bullets>
            </DocSection>

            <DocSection id="sources" index={n("sources")} title={t("sources")}>
              <p>
                <Term>ARK Invest.</Term> ARK Innovation ETF (ARKK) is read from ARK&apos;s daily holdings CSV:
              </p>
              <Formula>{ARK_CSV_URL}</Formula>
              <Bullets>
                <li>
                  The file covers only the latest market day, so history is built by fetching it on different days. The
                  first stored snapshot is dated 2026-10-16; a comparison needs a second one.
                </li>
                <li>
                  Weights arrive in percent and the ARK adapter converts them to fractions. The file has no price,
                  sector or asset-class column: price is derived from market value and share count, money-market funds
                  and cash are classed as cash, warrants and rights as other, and everything else as equity, including
                  private placements with pseudo-CUSIPs and no ticker.
                </li>
              </Bullets>
              <p>
                <Term>Synthetic test funds.</Term> Three small fixtures with known answers back the test suite and the
                demo: <C>DEMO</C> (four holdings, with one position added, one removed and one increased), <C>SPLT</C>{" "}
                (a 2-for-1 split that must not count as portfolio activity) and <C>FLOW</C> (every share count +10%,
                pure fund flow, no events).
              </p>
              <p>
                <Term>Ingest.</Term> Every file goes adapter → validate → normalize → load in one transaction. The
                content hash is sha256 over the normalized rows, so formatting differences in the raw file never change
                it. Loading the same file again is a no-op, different content for a stored date is rejected unless it
                is explicitly replaced, and any failure rolls back the whole snapshot. New issuers are added by writing
                an adapter.
              </p>
            </DocSection>

            <DocSection id="limitations" index={n("limitations")} title={t("limitations")}>
              <Bullets>
                <li>Snapshot comparisons can&apos;t see position changes that reversed within the period.</li>
                <li>
                  The median flow factor misreads periods where the manager changes most positions in the same
                  direction.
                </li>
                <li>Removed holdings use the earlier price in the counterfactual.</li>
                <li>Split detection is a heuristic. Mergers, spin-offs and ticker reuse are not modeled.</li>
                <li>Sector labels are team-assigned, not an official classification.</li>
                <li>
                  Issuer files usually show only the current day, so real history exists only from the first fetch
                  onward.
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
