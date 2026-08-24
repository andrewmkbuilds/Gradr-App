import { BrandLogo } from "@/components/BrandLogo";
import { motion } from "motion/react";
import { type ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
}

const TITLE = "Gradr";

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg overflow-hidden relative">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      {/* Ambient background motion — liquid blobs across the whole screen */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="liquid-blob absolute -top-32 -left-24 h-[420px] w-[420px] bg-primary/20 opacity-[var(--decor-strength)]" />
        <div className="liquid-blob absolute top-1/3 -right-32 h-[520px] w-[520px] bg-brand-secondary/15 opacity-[var(--decor-strength)]" style={{ animationDelay: "-6s" }} />
        <div className="liquid-blob absolute -bottom-40 left-1/3 h-[380px] w-[380px] bg-primary/15 opacity-[var(--decor-strength)]" style={{ animationDelay: "-12s" }} />
        {/* Floating particles */}
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className={`absolute h-1.5 w-1.5 rounded-full bg-primary/50 ${i % 2 ? "float-slow" : "float-mid"}`}
            style={{
              left: `${(i * 73) % 100}%`,
              top: `${(i * 41) % 100}%`,
              animationDelay: `${(i % 5) * -1.3}s`,
              boxShadow: "0 0 12px hsl(var(--primary) / 0.7)",
            }}
          />
        ))}
        {/* Self-drawing line decoration */}
        <svg className="absolute inset-0 h-full w-full opacity-20 dark:opacity-30" viewBox="0 0 1200 800" fill="none" preserveAspectRatio="none">
          <path
            className="draw-stroke"
            d="M0,600 C200,500 400,700 600,520 S1000,300 1200,400"
            stroke="hsl(var(--primary))"
            strokeWidth="1.2"
          />
          <path
            className="draw-stroke"
            style={{ animationDelay: "0.6s" }}
            d="M0,300 C300,200 500,420 800,260 S1100,180 1200,220"
            stroke="hsl(var(--brand-secondary))"
            strokeWidth="1"
          />
        </svg>
      </div>

      {/* Right panel — form content */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-sm space-y-7 glassmorphic rounded-3xl p-7 sm:p-8"
        >
          {/* Brand mark above the form — the marketing hero panel was removed. */}
          <div className="text-center space-y-3">
            <div className="relative h-14 w-14 mx-auto">
              <div className="conic-spin absolute inset-0 rounded-control opacity-90" />
              <BrandLogo size={52} className="absolute inset-[2px] rounded-control bg-shell" />
            </div>
            <div className="text-2xl font-bold kinetic-text">{TITLE}</div>
            <p
              data-auth-hero="mobile"
              className="text-xl sm:text-2xl font-bold leading-[1.25] tracking-tight break-words text-balance min-w-0 max-w-full pb-1"
            >
              <span className="block">Your AI career</span>
              <span className="kinetic-text block pb-1">command center.</span>
            </p>
          </div>


          {children}
        </motion.div>
      </main>
    </div>
  );
}
