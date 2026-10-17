import type { Metadata } from "next";
import { Suspense } from "react";

import FundProfile from "@/components/fund/FundProfile";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Fund · ${BRAND}` };

export default function FundPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading fund profile…</p>}>
      <FundProfile />
    </Suspense>
  );
}
