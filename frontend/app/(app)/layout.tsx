import AppNav from "@/components/app/AppNav";
import StatusBar from "@/components/app/StatusBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <AppNav />
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      <StatusBar />
    </div>
  );
}
