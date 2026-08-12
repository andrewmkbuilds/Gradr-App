import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GuestBanner } from "@/components/GuestBanner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AmbientBackground } from "@/components/AmbientBackground";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AmbientBackground />
      <div className="relative z-10 min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <PaymentTestModeBanner />
          <GuestBanner />
          <header className="glass-bar enter-up sticky top-0 z-30 h-14 flex items-center justify-between border-b border-border/70 px-4 shrink-0">
            <SidebarTrigger className="interactive press-scale text-muted-foreground hover:text-foreground" />
            <NotificationsBell />
          </header>
          <main data-scroll-container className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
