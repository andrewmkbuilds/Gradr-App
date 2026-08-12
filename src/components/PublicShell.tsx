import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trackEvent } from "@/lib/analytics";
import { LEGAL_PAGES } from "@/content/legal";

interface PublicShellProps {
  children: React.ReactNode;
  /** Identifier used for CTA analytics. */
  source: string;
}

const NAV = [
  { label: "Career advice", to: "/career-advice" },
  { label: "Job search", to: "/job-search" },
  { label: "Pricing", to: "/pricing" },
];

/** Chrome for public, indexable pages (guides + job landing pages). */
export function PublicShell({ children, source }: PublicShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Gradr
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-5 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/auth?mode=signup"
              onClick={() => trackEvent("signup_cta_click", { source, location: "header" })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Gradr — the AI career command center.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
            {LEGAL_PAGES.map((page) => (
              <Link key={page.path} to={page.path} className="hover:text-foreground">
                {page.label}
              </Link>
            ))}
            <Link to="/auth" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
