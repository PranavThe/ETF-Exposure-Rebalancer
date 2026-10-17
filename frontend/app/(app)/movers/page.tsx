import type { Metadata } from "next";
import { Suspense } from "react";

import MoversBoard from "@/components/movers/MoversBoard";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Movers · ${BRAND}` };

export default function MoversPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading movers…</p>}>
      <MoversBoard />
    </Suspense>
  );
}
