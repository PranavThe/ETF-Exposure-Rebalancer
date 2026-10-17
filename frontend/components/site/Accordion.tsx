"use client";

import { useId, useState } from "react";

import { PlusIcon } from "./Frame";

export type AccordionItem = { title: string; body: React.ReactNode };

/**
 * A list of disclosure rows; opening one closes the others. Each header is a button with
 * aria-expanded and aria-controls pointing at its panel.
 */
export default function Accordion({
  items,
  defaultOpen = 0,
  size = "md",
  headingLevel = 4,
}: {
  items: AccordionItem[];
  /** Index of the row open on first render, or null for all closed. */
  defaultOpen?: number | null;
  size?: "md" | "lg";
  /** Heading level wrapping each row's button, to fit the surrounding outline. */
  headingLevel?: 3 | 4;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const base = useId();
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const rowPad = size === "lg" ? "py-6" : "py-4";
  const titleSize = size === "lg" ? "text-[17px] sm:text-[19px]" : "text-[16px] sm:text-[17px]";

  return (
    <ul className="border-b border-line">
      {items.map((item, i) => {
        const isOpen = open === i;
        const buttonId = `${base}-button-${i}`;
        const panelId = `${base}-panel-${i}`;
        return (
          <li key={item.title} className="border-t border-line">
            <Heading className="m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className={`group flex w-full items-center justify-between gap-6 text-left ${rowPad} ${titleSize} font-light transition-colors ${
                  isOpen ? "text-fg" : "text-fg/70 hover:text-fg"
                }`}
              >
                <span>{item.title}</span>
                <PlusIcon className={isOpen ? "text-fg/80" : "text-faint group-hover:text-fg/70"} />
              </button>
            </Heading>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              data-open={isOpen}
              inert={!isOpen}
              className="site-collapse"
            >
              <div>
                <div className={`max-w-prose pr-8 ${size === "lg" ? "pb-7" : "pb-5"} text-[15px] leading-relaxed text-muted`}>
                  {item.body}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
