import Link from "next/link";

import { ArrowUpRight } from "./Frame";
import type { SiteLink } from "./links";

/** An internal Link or an external anchor (new tab), with the same styling hook. */
export default function SiteLinkItem({
  link,
  className = "",
  onClick,
  arrow = true,
}: {
  link: SiteLink;
  className?: string;
  onClick?: () => void;
  arrow?: boolean;
}) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" onClick={onClick} className={`inline-flex items-center gap-1.5 ${className}`}>
        {link.label}
        {arrow && <ArrowUpRight className="opacity-60" />}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={link.href} onClick={onClick} className={className}>
      {link.label}
    </Link>
  );
}
