import { apiDocsUrl } from "@/lib/api";

export const GITHUB_URL = "https://github.com/PranavThe/ETF-Exposure-Rebalancer";
export const ARK_CSV_URL =
  "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv";

export type SiteLink = { label: string; href: string; external?: boolean };

export const LAUNCH_APP: SiteLink = { label: "Open the app", href: "/app" };
export const METHODOLOGY: SiteLink = { label: "Methodology", href: "/methodology" };
export const API_DOCS: SiteLink = { label: "API docs", href: apiDocsUrl, external: true };
export const GITHUB: SiteLink = { label: "GitHub", href: GITHUB_URL, external: true };

export const NAV_LINKS: SiteLink[] = [LAUNCH_APP, METHODOLOGY, API_DOCS, GITHUB];

export const DISCLAIMER = "Derived from issuer-published holdings snapshots. Not investment advice.";
