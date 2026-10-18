import type { Metadata } from "next";

import Faq from "@/components/site/Faq";
import FeatureSection from "@/components/site/FeatureSection";
import { FrameDivider } from "@/components/site/Frame";
import Hero from "@/components/site/Hero";
import { API_DOCS } from "@/components/site/links";
import PipelineDiagram from "@/components/site/PipelineDiagram";
import SiteLinkItem from "@/components/site/SiteLinkItem";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND} — active ETF holdings, decomposed`,
  description:
    "See how an actively managed ETF's holdings changed between two issuer-published snapshots, with every weight change split into price effect and portfolio activity.",
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FrameDivider />

      <FeatureSection
        id="terminal"
        tag="The terminal"
        title="Every snapshot, one desk"
        intro={
          <p>
            Pick a fund and two dates. Sector drift, concentration, events and every holding sit side by side, and each
            number traces back to the published source file or filing it came from.
          </p>
        }
        subTitle="Price vs. portfolio activity"
        subIntro={
          <p>
            A weight can move because prices moved or because share counts changed. {BRAND} measures both and shows them
            next to every drift, so a flat number never hides a busy period.
          </p>
        }
        items={[
          {
            title: "Counterfactual weights",
            body: (
              <p>
                Earlier share counts are valued at later prices to get the weights the fund would have had with no
                position changes. The distance from the earlier weights is the price effect; the rest is portfolio
                activity.
              </p>
            ),
          },
          {
            title: "Flow-adjusted share counts",
            body: (
              <p>
                Creations and redemptions scale every position together. The median share-count ratio across common
                holdings is divided out first, so fund flows are never mistaken for an increased or decreased position.
              </p>
            ),
          },
          {
            title: "Suspected splits",
            body: (
              <p>
                A share count that doubles while the price halves is not a position change. Ratios near 2, 3, 4, 5, 10
                or 20 with an offsetting price move are flagged as suspected splits and kept out of portfolio activity.
              </p>
            ),
          },
        ]}
        visual={
          <div className="mx-auto grid w-full max-w-[560px] gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            {[
              ["Snapshot A", "Reported holdings and weights"],
              ["Revalue", "Apply later market prices"],
              ["Snapshot B", "Compare with reported holdings"],
            ].map(([title, detail], index) => (
              <div key={title} className="contents">
                {index > 0 && <span aria-hidden className="hidden text-center font-mono text-muted sm:block">→</span>}
                <div className="rounded-md border border-line bg-panel px-4 py-5">
                  <p className="font-mono text-xs uppercase tracking-wider text-fg">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        }
      />
      <FrameDivider />

      <FeatureSection
        id="pipeline"
        reverse
        tag="The pipeline"
        title="Source-verified, end to end"
        intro={
          <p>
            Issuer holdings files and SEC filings pass through validation and normalization before they are stored.
            Each snapshot keeps its source, reporting date and content hash.
          </p>
        }
        items={[
          {
            title: "Idempotent loads",
            body: <p>Re-ingesting the same normalized snapshot is a no-op; conflicting content is rejected unless explicitly replaced.</p>,
          },
          {
            title: "Row-level validation",
            body: <p>Malformed, duplicate or incomplete rows are rejected with the source file and field identified.</p>,
          },
          {
            title: "Open REST API",
            body: (
              <p>
                A public, read-only API serves loaded funds, snapshots, holdings and comparisons as JSON.{" "}
                <SiteLinkItem link={{ ...API_DOCS, label: "Browse the API docs" }} className="text-fg underline decoration-line-2 underline-offset-4 hover:decoration-fg" />
              </p>
            ),
          },
        ]}
        visual={<PipelineDiagram />}
      />
      <FrameDivider />

      <Faq />
    </>
  );
}
