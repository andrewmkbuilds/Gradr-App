import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GuestBanner } from "@/components/GuestBanner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AmbientBackground } from "@/components/AmbientBackground";
import { ThemeToggle } from "@/components/ThemeToggle";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AmbientBackground />
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="relative z-10 min-h-dvh flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <PaymentTestModeBanner />
          <GuestBanner />
          <header className="glass-bar enter-up sticky top-0 z-30 h-14 flex items-center justify-between border-b border-border/70 px-4 shrink-0">
            <SidebarTrigger className="interactive press-scale text-muted-foreground hover:text-foreground" />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationsBell />
            </div>
          </header>
          {/* No nested scroll container: the page scrolls with the document so
              there is only ever one vertical scrollbar. min-w-0 + overflow-x-clip
              stops wide children (tables, charts) creating a horizontal bar. */}
          <main id="main-content" className="flex-1 min-w-0 overflow-x-clip p-4 pb-24 sm:p-6 md:pb-6">

            {children}
          </main>
          <MobileTabBar />

        </div>
      </div>
    </SidebarProvider>
  );
}
