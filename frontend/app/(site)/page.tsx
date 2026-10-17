import type { Metadata } from "next";

import EventsMock from "@/components/site/EventsMock";
import Faq from "@/components/site/Faq";
import FeatureSection from "@/components/site/FeatureSection";
import { FrameDivider } from "@/components/site/Frame";
import Hero from "@/components/site/Hero";
import { API_DOCS } from "@/components/site/links";
import PipelineDiagram from "@/components/site/PipelineDiagram";
import SectorBars from "@/components/site/SectorBars";
import SiteLinkItem from "@/components/site/SiteLinkItem";
import TerminalWindow from "@/components/site/TerminalWindow";
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
            number traces back to the issuer file it came from.
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
        visual={<TerminalWindow />}
      />
      <FrameDivider />

      <FeatureSection
        id="pipeline"
        reverse
        tag="The pipeline"
        title="Source-verified, end to end"
        intro={
          <p>
            Each issuer file runs through an adapter, row-level validation, normalization and a single transactional
            load. What the API serves is exactly what the file said, with a content hash to prove it.
          </p>
        }
        items={[
          {
            title: "Canonical content hashes",
            body: (
              <p>
                Every snapshot is fingerprinted with sha256 over its normalized rows, so whitespace, quoting, column
                order or number formatting in the raw file never change the hash.
              </p>
            ),
          },
          {
            title: "Idempotent, transactional loads",
            body: (
              <p>
                Ingesting the same file again is a no-op that reports{" "}
                <code className="font-mono text-[13px] text-fg/85">already ingested</code>. Different content for a
                stored date is rejected unless you pass <code className="font-mono text-[13px] text-fg/85">--replace</code>,
                and any failure rolls back the whole snapshot.
              </p>
            ),
          },
          {
            title: "Row-level validation",
            body: (
              <p>
                Missing columns, duplicate securities, negative equity rows, unknown funds and weight totals outside
                90–110% are rejected with the file, row and field named. Smaller mismatches are kept and reported as
                warnings.
              </p>
            ),
          },
          {
            title: "Open REST API",
            body: (
              <p>
                A public, read-only API serves funds, snapshots, raw holdings and full comparisons as JSON. The terminal
                runs on the same endpoints.{" "}
                <SiteLinkItem link={{ ...API_DOCS, label: "Browse the API docs" }} className="text-fg underline decoration-line-2 underline-offset-4 hover:decoration-fg" />
              </p>
            ),
          },
        ]}
        visual={<PipelineDiagram />}
      />
      <FrameDivider />

      <FeatureSection
        id="sectors"
        tag="Sectors"
        title="Net drift hides the real story"
        intro={
          <p>
            In the DEMO fund, Technology ends the day exactly where it started. Underneath, prices added 5.6 pp and
            portfolio activity elsewhere diluted it by the same amount. {BRAND} shows both halves of every sector move.
          </p>
        }
        items={[
          {
            title: "Price vs. activity per sector",
            body: (
              <p>
                Each sector&apos;s drift splits into the same two parts as its holdings: price effect and portfolio
                activity, summed over the sector&apos;s positions. The parts always add back to the drift.
              </p>
            ),
          },
          {
            title: "Direct vs. dilution",
            body: (
              <p>
                Activity from positions that were added, removed, increased or decreased is direct. Activity on
                untouched positions, whose weights moved only because others changed size, is dilution and is labelled
                that way.
              </p>
            ),
          },
          {
            title: "Unknown is a real bucket",
            body: (
              <p>
                Sectors come from a maintained reference mapping, then the issuer&apos;s own sector column, then
                Unknown. Unmapped holdings are never dropped: Unknown is shown like any other sector and raises a
                caveat.
              </p>
            ),
          },
        ]}
        visual={<SectorBars />}
      />
      <FrameDivider />

      <FeatureSection
        id="events"
        reverse
        tag="Events"
        title="Every change explained"
        intro={
          <p>
            Material changes become plain-language events: sector moves, concentration shifts, positions added,
            removed, increased or decreased, and suspected splits. Each one carries its price and portfolio-activity
            split.
          </p>
        }
        items={[
          {
            title: "Deterministic IDs",
            body: (
              <p>
                An event ID is the first 16 hex characters of sha256 over fund, dates, type, subject and config
                version. Running the same comparison again gives the same IDs, so links and notes stay valid.
              </p>
            ),
          },
          {
            title: "Thresholds in one config",
            body: (
              <p>
                Event rules live in one versioned config: a 5% flow-adjusted share change and 0.1 pp of portfolio
                activity for a position, 1.0 pp for sector drift and for concentration. Changing a rule means bumping
                the version, which changes every ID.
              </p>
            ),
          },
          {
            title: "One click to source data",
            body: (
              <p>
                Selecting an event highlights its contributing holdings and shows both snapshots&apos; source files and
                content hashes, with links to the raw holdings JSON.
              </p>
            ),
          },
        ]}
        visual={<EventsMock />}
      />
      <FrameDivider />

      <Faq />
    </>
  );
}
