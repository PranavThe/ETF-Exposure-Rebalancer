import type { Metadata } from "next";

import DiscoverBoard from "@/components/discover/DiscoverBoard";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Discover · ${BRAND}` };

export default function DiscoverPage() {
  return <DiscoverBoard />;
}
