import { motion } from "motion/react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GuestBanner } from "@/components/GuestBanner";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AmbientBackground } from "@/components/AmbientBackground";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTabBar } from "@/components/MobileTabBar";
import { PolicyUpdateGate } from "@/components/legal/PolicyUpdateGate";
import { NavBreadcrumb } from "@/components/NavBreadcrumb";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration, easeOut } from "@/lib/motion/tokens";

/**
 * The authenticated shell. A glass command bar over an ambient Yacht Club
 * wash, with the route canvas underneath handling its own transition
 * (see `AnimatedPage`). Timing comes from the shared motion tokens.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionPref();

  return (
    <SidebarProvider>
      <AmbientBackground />
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="relative z-10 flex min-h-dvh w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <PaymentTestModeBanner />
          <GuestBanner />

          <motion.header
            data-scrolled={scrolled ? "" : undefined}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            animate={{
              opacity: 1,
              y: 0,
              height: reduced ? 56 : scrolled ? 52 : 60,
            }}
            transition={{ duration: reduced ? duration.micro : duration.base, ease: easeOut }}
            className={cn(
              "glass-bar sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 px-4 transition-[backdrop-filter,box-shadow,background-color] duration-300",
              scrolled
                ? "border-b border-border/80 shadow-[0_10px_30px_-24px_hsl(var(--foreground)/0.55)] backdrop-blur-2xl"
                : "border-b border-transparent backdrop-blur-md",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="interactive press-scale shrink-0 text-muted-foreground hover:text-foreground" />
              <NavBreadcrumb />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <NotificationsBell />
            </div>
            {/* Hairline that catches the ambient light along the bar's edge —
                it only lights up once the page has actually moved. */}
            <motion.span
              aria-hidden="true"
              animate={{ opacity: scrolled ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : duration.fast, ease: easeOut }}
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
            />
          </motion.header>


          {/* No nested scroll container: the page scrolls with the document so
              there is only ever one vertical scrollbar. min-w-0 + overflow-x-clip
              stops wide children (tables, charts) creating a horizontal bar. */}
          <main
            id="main-content"
            className="min-w-0 flex-1 overflow-x-clip p-4 pb-24 sm:p-6 md:pb-6"
          >
            {children}
          </main>

          <MobileTabBar />
          <PolicyUpdateGate />
        </div>
      </div>
    </SidebarProvider>
  );
}
