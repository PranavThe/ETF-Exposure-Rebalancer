import type { Metadata } from "next";

import { ExposureMock, PlanMock, TargetMock } from "@/components/site/ExampleVisuals";
import Faq from "@/components/site/Faq";
import FeatureSection from "@/components/site/FeatureSection";
import { FrameDivider } from "@/components/site/Frame";
import Hero from "@/components/site/Hero";
import HowItWorks from "@/components/site/HowItWorks";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND} — see what your ETFs really hold`,
  description:
    "Enter the ETFs you hold and how much is in each. See your real sector mix, set the mix you want with sliders or plain words, and get the moves that get you there.",
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FrameDivider />

      <HowItWorks />
      <FrameDivider />

      <FeatureSection
        id="look-through"
        tag="Look-through"
        title="What your ETFs really hold"
        intro={
          <p>
            An ETF is a basket of companies. {BRAND} reads each fund&apos;s latest published holdings, groups them by
            sector and blends them by the dollars you have in each fund. The result is your real sector mix, in one
            picture.
          </p>
        }
        items={[
          {
            title: "Weighted by your dollars",
            body: (
              <p>
                $6,000 in IVV counts twice as much as $3,000 in IYW. Each ETF&apos;s sector mix is weighted by the money
                you have in it, then added up.
              </p>
            ),
          },
          {
            title: "Overlap shows up",
            body: (
              <p>
                Different ETFs can lean on the same sector. IVV is about 38% technology and IYW about 90%, so together
                they put more than half of this example portfolio in Technology.
              </p>
            ),
          },
          {
            title: "Missing data is flagged, never guessed",
            body: (
              <p>
                If an ETF has no holdings data yet, it stays on your list with a flag and is left out of the mix.
                Nothing is filled in with estimates.
              </p>
            ),
          },
        ]}
        visual={<ExposureMock />}
      />
      <FrameDivider />

      <FeatureSection
        id="your-target"
        reverse
        tag="Your target"
        title="You decide. We do the math."
        intro={
          <p>
            Set the mix you want with a slider for each sector, or just say it: &ldquo;less tech, more health
            care&rdquo;, &ldquo;no energy&rdquo;, &ldquo;I&apos;m adding $2,000&rdquo;. The assistant turns your words
            into numbers you can see and change. It never decides what you should want.
          </p>
        }
        items={[
          {
            title: "Sliders always work",
            body: (
              <p>
                Every sector has its own slider, and they work on their own. The assistant is a shortcut, never a
                requirement.
              </p>
            ),
          },
          {
            title: "Plain words, exact numbers",
            body: (
              <p>
                The assistant, Claude, changes only what you mention, keeps the total at 100%, and tells you what moved
                in % and pp. Mention money you&apos;re adding or taking out and the plans use that amount.
              </p>
            ),
          },
          {
            title: "No opinions",
            body: (
              <p>
                Ask which sector is best and it will tell you the choice is yours. It can explain what a sector
                contains, but it won&apos;t predict markets or pick a mix for you.
              </p>
            ),
          },
        ]}
        visual={<TargetMock />}
      />
      <FrameDivider />

      <FeatureSection
        id="plans"
        tag="The plans"
        title="The moves to get there"
        intro={
          <p>
            {BRAND} works out how to reach your target: reduce or increase the ETFs you hold, or add up to two new ones.
            Each plan shows how close it gets and how much money moves.
          </p>
        }
        subTitle="Options, not instructions"
        subIntro={
          <p>
            Nothing happens automatically and nothing connects to your brokerage. You see the moves; whether you make
            any of them is up to you.
          </p>
        }
        items={[
          {
            title: "A plan for each situation",
            body: (
              <p>
                Rearrange only what you own, rearrange and add new ETFs, invest new money without reducing anything, or
                take money out only by reducing.
              </p>
            ),
          },
          {
            title: "How close, in pp",
            body: (
              <p>
                Distance is the share of your portfolio sitting in a different sector than you want. 5.0 pp means five
                cents of every dollar; 0.0 pp is a perfect match.
              </p>
            ),
          },
          {
            title: "No clutter",
            body: (
              <p>
                Positions under 1% of your portfolio are dropped, a new ETF joins only if it brings you at least 0.5 pp
                closer, and every amount is in whole dollars.
              </p>
            ),
          },
          {
            title: "Saved without an account",
            body: (
              <p>
                Your ETFs and target save to a private link. The key that lets you edit them stays in this browser.
              </p>
            ),
          },
        ]}
        visual={<PlanMock />}
      />
      <FrameDivider />

      <Faq />
    </>
  );
}
