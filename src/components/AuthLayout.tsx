import { Sparkles, Target, Brain, Rocket } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MotionQuickToggle } from "@/components/motion/MotionQuickToggle";

interface AuthLayoutProps {
  children: ReactNode;
}

const features = [
  { icon: Brain, label: "AI resume scoring & rewrite engine" },
  { icon: Target, label: "Smart job matching with strategy" },
  { icon: Sparkles, label: "One-click cover letters & outreach" },
  { icon: Rocket, label: "Mock interviews with realtime coach" },
];

const TITLE = "Gradr";

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex aurora-bg overflow-hidden relative">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-1">
        <MotionQuickToggle />
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

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md px-8 xl:px-12 space-y-8"
        >
          {/* Animated logo: conic-spin ring + center mark + stop-motion sparkle */}
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 shrink-0">
              <div className="conic-spin absolute inset-0 rounded-2xl opacity-90" />
              <BrandLogo size={52} className="absolute inset-[2px] rounded-2xl" />
            </div>
            {/* Brand mark, not a heading — each auth page owns the single page <h1>. */}
            <div className="text-3xl font-bold tracking-tight kinetic-text">{TITLE}</div>
          </div>

          {/* Expressive typography — letter reveal on line one, kinetic gradient on line two.
              Line two is a single gradient element: nesting per-letter spans inside a
              background-clip:text parent paints them transparent (the words disappear). */}
          {/* LAYOUT GUARDRAIL: never add fixed heights, truncate, line-clamp,
              whitespace-nowrap or overflow-hidden to the hero headline — the
              full sentence must always be visible. Enforced by
              src/test/authHeroLayout.test.ts. */}
          <p
            data-auth-hero="desktop"
            className="text-3xl xl:text-4xl font-bold leading-[1.2] tracking-tight break-words text-balance min-w-0 max-w-full pb-1"
          >
            <span className="letter-reveal block">
              {"Your AI career".split("").map((c, i) => (
                <span key={`a${i}`} style={{ animationDelay: `${i * 35}ms` }}>
                  {c === " " ? "\u00A0" : c}
                </span>
              ))}
            </span>
            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
              className="kinetic-text block pb-1"
            >
              command center.
            </motion.span>
          </p>


          <p className="text-muted-foreground leading-relaxed text-base">
            Resume analysis. Job matching. Application generation. Interview coaching. One platform, zero guesswork.
          </p>

          {/* Glassmorphic feature stack — faux-3D tilt on hover */}
          <div className="space-y-3 pt-2">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
                className="glassmorphic tilt-3d rounded-xl px-4 py-3 flex items-center gap-3 cursor-default"
              >
                <div className="claymorphic h-9 w-9 flex items-center justify-center shrink-0">
                  <f.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm text-foreground/90">{f.label}</span>
              </motion.div>
            ))}
          </div>

          {/* Marquee trust strip */}
          <div className="overflow-hidden mask-marquee pt-2" style={{ maskImage: "linear-gradient(90deg, transparent, black 15%, black 85%, transparent)" }}>
            <div className="flex gap-10 marquee whitespace-nowrap text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {Array.from({ length: 2 }).map((_, dup) => (
                <div key={dup} className="flex gap-10 shrink-0">
                  <span>· AI Resume Engine</span>
                  <span>· Realtime Interview</span>
                  <span>· Pipeline Tracker</span>
                  <span>· Smart Match</span>
                  <span>· Outreach Studio</span>
                  <span>· Growth Insights</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right panel — form content */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-sm space-y-7 glassmorphic rounded-3xl p-7 sm:p-8"
        >
          {/* Mobile/tablet-only brand + headline (the left panel is hidden below lg,
              so the headline must render here or it disappears entirely). */}
          <div className="lg:hidden text-center space-y-3">
            <div className="relative h-14 w-14 mx-auto">
              <div className="conic-spin absolute inset-0 rounded-2xl opacity-90" />
              <BrandLogo size={52} className="absolute inset-[2px] rounded-2xl" />
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
