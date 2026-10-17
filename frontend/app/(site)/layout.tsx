import AnnouncementBar from "@/components/site/AnnouncementBar";
import { Frame } from "@/components/site/Frame";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

import "@/components/site/site.css";

// Marketing pages: announcement bar, then the bordered frame with header, page and footer.
// The app's nav and status bar live in app/(app)/layout.tsx and are not used here.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:text-black"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <Frame>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </Frame>
    </div>
  );
}
