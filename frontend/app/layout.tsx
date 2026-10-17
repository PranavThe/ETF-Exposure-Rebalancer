import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FundShift",
  description: "How an active ETF's portfolio changed: price movement versus portfolio activity.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900">
        {children}
        <footer className="border-t border-zinc-200 px-4 py-3 text-center text-xs text-zinc-500">
          Derived from issuer-published holdings snapshots. Not investment advice.
        </footer>
      </body>
    </html>
  );
}
