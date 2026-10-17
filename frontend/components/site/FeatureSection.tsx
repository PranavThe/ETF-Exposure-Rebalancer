import Accordion, { type AccordionItem } from "./Accordion";
import { TagPill } from "./Frame";
import Reveal from "./Reveal";

/**
 * A tall two-column section: copy (tag, heading, paragraph, optional sub-feature, accordion)
 * on one side and a product visual on the other. `reverse` puts the visual on the left.
 */
export default function FeatureSection({
  id,
  tag,
  title,
  intro,
  subTitle,
  subIntro,
  items,
  visual,
  reverse = false,
  wideVisual = true,
}: {
  id: string;
  tag: string;
  title: string;
  intro: React.ReactNode;
  subTitle?: string;
  subIntro?: React.ReactNode;
  items: AccordionItem[];
  visual: React.ReactNode;
  reverse?: boolean;
  /** Give the visual the larger share of the row (screenshots); false splits evenly. */
  wideVisual?: boolean;
}) {
  const headingId = `${id}-heading`;
  const cols = wideVisual
    ? reverse
      ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
      : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    : "lg:grid-cols-2";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex items-center px-5 py-20 sm:px-8 sm:py-28 lg:min-h-[860px] lg:px-14 lg:py-36"
    >
      <div className={`grid w-full grid-cols-1 items-center gap-14 lg:gap-16 ${cols}`}>
        <Reveal className={`w-full max-w-[460px] ${reverse ? "lg:order-2 lg:justify-self-end" : ""}`}>
          <TagPill>{tag}</TagPill>
          <h2 id={headingId} className="mt-6 text-[32px] leading-[1.1] font-light tracking-[-0.02em] text-fg sm:text-[38px]">
            {title}
          </h2>
          <div className="mt-6 text-[16px] leading-[1.6] text-muted sm:text-[17px]">{intro}</div>
          {subTitle && (
            <>
              <h3 className="mt-14 text-[26px] leading-[1.15] font-light tracking-[-0.02em] text-fg sm:text-[30px]">{subTitle}</h3>
              {subIntro && <div className="mt-6 text-[16px] leading-[1.6] text-muted sm:text-[17px]">{subIntro}</div>}
            </>
          )}
          <div className="mt-10">
            <Accordion items={items} />
          </div>
        </Reveal>
        <Reveal delay={120} className={`min-w-0 ${reverse ? "lg:order-1" : ""}`}>
          {visual}
        </Reveal>
      </div>
    </section>
  );
}
