"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BRAND } from "@/lib/brand";

import { FrameDivider, PlusIcon } from "./Frame";
import { NAV_LINKS } from "./links";
import SiteLinkItem from "./SiteLinkItem";

const NAV_CLASS = "font-mono text-[12px] tracking-[0.06em] uppercase transition-colors";

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-base/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-[19px] font-semibold tracking-tight text-fg" aria-label={`${BRAND} home`}>
          {BRAND}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-10 md:flex">
          {NAV_LINKS.map((l) => (
            <SiteLinkItem
              key={l.label}
              link={l}
              arrow={false}
              className={`${NAV_CLASS} ${pathname === l.href ? "text-accent" : "text-fg/85 hover:text-fg"}`}
            />
          ))}
        </nav>

        <button
          type="button"
          className={`${NAV_CLASS} -mr-2 flex items-center gap-2 px-2 py-2 text-fg/85 hover:text-fg md:hidden`}
          aria-expanded={open}
          aria-controls="site-mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <nav id="site-mobile-nav" aria-label="Main" className="border-t border-line md:hidden">
          <ul>
            {NAV_LINKS.map((l) => (
              <li key={l.label} className="border-b border-line last:border-b-0">
                <SiteLinkItem
                  link={l}
                  onClick={() => setOpen(false)}
                  className={`${NAV_CLASS} flex w-full items-center justify-between px-5 py-4 sm:px-8 ${
                    pathname === l.href ? "text-accent" : "text-fg/85 hover:text-fg"
                  }`}
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      <FrameDivider />
    </header>
  );
}
