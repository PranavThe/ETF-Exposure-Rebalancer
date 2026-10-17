import type { Metadata } from "next";

import PortfolioWorkspace from "@/components/portfolio/PortfolioWorkspace";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Portfolio · ${BRAND}` };

export default function PortfolioPage() {
  return <PortfolioWorkspace />;
}
