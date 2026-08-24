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
import { SignupConsentSync } from "@/components/legal/SignupConsentSync";
import { NavBreadcrumb } from "@/components/NavBreadcrumb";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { useScrollTransform } from "@/hooks/useScrollTransform";
import { duration, easeOut } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * The authenticated shell. A glass command bar over an ambient Yacht Club
 * wash, with the route canvas underneath handling its own transition
 * (see `AnimatedPage`). Timing comes from the shared motion tokens.
 *
 * The bar transforms on scroll: it compresses, deepens its glass and lights a
 * hairline the moment the page moves, then relaxes back at the top.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionPref();
  const { scrolled } = useScrollTransform();


  return (
    <SidebarProvider>
      <AmbientBackground />
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-control focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-button focus-visible:font-medium focus-visible:text-primary-foreground"
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
              "glass-bar sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 px-4 sm:px-6 transition-[backdrop-filter,box-shadow,background-color] duration-300",
              scrolled
                ? "border-b border-border/80 shadow-float backdrop-blur-2xl"
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
          <SignupConsentSync />
        </div>
      </div>
    </SidebarProvider>
  );
}
