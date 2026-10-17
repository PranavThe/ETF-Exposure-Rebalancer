import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND } from "@/lib/brand";

import "./globals.css";

// Geist and Geist Mono are bundled (SIL OFL, see fonts/OFL-Geist.txt) so builds need no network.
const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND,
  description: "How an active ETF's portfolio changed: price movement versus portfolio activity.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas font-sans text-fg">{children}</body>
    </html>
  );
}
