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
  description: "See the sector mix inside the ETFs you own, choose the mix you want, and get the moves that get you there.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas font-sans text-fg">{children}</body>
    </html>
  );
}
