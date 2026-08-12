import { type ReactNode, useEffect } from "react";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";

import appCss from "../styles.css?url";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/useTheme";
import { AuthProvider } from "@/hooks/useAuth";
import { RouteSeo } from "@/components/RouteSeo";
import { CookieConsent } from "@/components/CookieConsent";
import { ScrollToTop } from "@/components/ScrollToTop";
import RootErrorBoundary from "@/components/RootErrorBoundary";
import { SentryErrorBoundary, addBreadcrumb } from "@/lib/telemetry/sentry";
import { phPageview } from "@/lib/telemetry/posthog";
import { initTelemetry } from "@/lib/telemetry/journey";
import { captureReferralFromUrl } from "@/lib/affiliateTracking";
import { useLocation } from "@/lib/router-compat";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import NotFound from "@/pages/NotFound";
import { AppSplash } from "@/components/AppSplash";

const SITE_TITLE = "Gradr | Your AI Career Command Center";
const SITE_DESCRIPTION =
  "Gradr is your AI career command center for resume analysis, job matching, applications, and interview coaching.";

// Paint the correct theme before first render so there is no flash.
// Ported from the pre-migration index.html head script.
const themeBootstrap = `(function () {
  try {
    var stored = localStorage.getItem("gradr-theme");
    var dark =
      stored === "dark" ||
      ((stored === null || stored === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();`;

// Ported from the pre-migration index.html JSON-LD block.
const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://gradr.me/#organization",
      name: "Gradr",
      alternateName: "Gradr AI Career Command Center",
      url: "https://gradr.me/",
      logo: "https://gradr.me/icon-512.png",
      description:
        "Gradr is an AI career platform for job seekers, covering resume analysis, ATS optimization, job matching, job applications, and AI mock interview coaching.",
    },
    {
      "@type": "WebSite",
      "@id": "https://gradr.me/#website",
      name: "Gradr",
      url: "https://gradr.me/",
      publisher: { "@id": "https://gradr.me/#organization" },
      inLanguage: "en",
    },
    {
      "@type": ["SoftwareApplication", "WebApplication"],
      "@id": "https://gradr.me/#software",
      name: "Gradr",
      alternateName: "Gradr Career OS",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Career and job search software",
      operatingSystem: "Web browser",
      url: "https://gradr.me/",
      browserRequirements: "Requires JavaScript and a modern web browser",
      publisher: { "@id": "https://gradr.me/#organization" },
      description:
        "Gradr is your AI career command center for resume analysis, job matching, applications, and interview coaching. It scores resumes against ATS rules, matches you to live job openings, drafts tailored applications, and runs realtime AI mock interviews with coaching feedback.",
      featureList: [
        "AI resume analysis and ATS optimization scoring",
        "AI job matching against live job openings",
        "Tailored job application and cover letter generation",
        "Realtime AI mock interviews with interview coaching",
        "Application pipeline tracking and career development planning",
      ],
      keywords:
        "AI career platform, resume analysis, ATS optimization, job matching, job applications, AI mock interviews, interview coaching, career development",
      audience: {
        "@type": "Audience",
        audienceType: "Job seekers, students, graduates, and career changers",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free plan available, with paid Pro plans for advanced AI features.",
      },
    },
  ],
});

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "Gradr" },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      {
        name: "keywords",
        content:
          "AI career platform, resume analysis, ATS optimization, job matching, job applications, AI mock interviews, interview coaching, career development",
      },
      { name: "application-name", content: "Gradr" },
      { name: "apple-mobile-web-app-title", content: "Gradr" },
      { name: "theme-color", content: "#070d1a", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#f7f9fc", media: "(prefers-color-scheme: light)" },
      { name: "google-site-verification", content: "N0LjBnLEMo8ZqJ1lwaVLoswy8UkfIXMwgdfk35YEY-s" },
      { name: "google-site-verification", content: "KJgcSDDga9hUzoDhgnCK8yWa_MU6PJX_kW27pzKLbAo" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Gradr" },
      { property: "og:locale", content: "en_US" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: "https://gradr.me/" },
      { property: "og:image", content: "https://gradr.me/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Gradr — AI career command center" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: "https://gradr.me/og-image.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "canonical", href: "https://gradr.me/" },
      { rel: "preconnect", href: "https://xaeyjrekewnwjujnrqgu.supabase.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://xaeyjrekewnwjujnrqgu.supabase.co" },
    ],
    scripts: [
      { children: themeBootstrap },
      { type: "application/ld+json", children: structuredData },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => <NotFound />,
  errorComponent: RootErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ReferralCapture() {
  useEffect(() => {
    void captureReferralFromUrl();
  }, []);
  return null;
}

function TelemetryRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    phPageview(location.pathname);
    addBreadcrumb("navigation", location.pathname);
  }, [location.pathname]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // ported from main.tsx — telemetry init runs once after hydration.
  useEffect(() => {
    initTelemetry();
  }, []);

  return (
    <RootErrorBoundary>
      <SentryErrorBoundary
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">Something broke on our side</p>
              <p className="text-sm text-muted-foreground">
                The issue has been reported. Refresh the page to continue.
              </p>
            </div>
          </div>
        }
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <HelmetProvider>
                <ScrollToTop />
                <ReferralCapture />
                <TelemetryRouteTracker />
                <AuthProvider>
                  <RouteSeo />
                  <AppSplash />
                  <Outlet />
                  <CookieConsent />
                </AuthProvider>
              </HelmetProvider>
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SentryErrorBoundary>
    </RootErrorBoundary>
  );
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong on our end. You can try again or head back home.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <a className="px-4 py-2 rounded-md border border-border" href="/">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
