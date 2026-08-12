/**
 * PricingSection — premium plan cards with hover/tap physics, a comparison
 * matrix and a working subscription CTA flow.
 *
 * All controls are 44px+ touch targets, `whileTap` gives physical feedback on
 * mobile, and every animation collapses under reduced motion.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ease, spring } from "@/lib/motion";
import { GlowFrame, Glare } from "@/components/reactbits";

export type Plan = {
  name: string;
  tagline: string;
  monthly: { price: string; note: string };
  annual: { price: string; note: string };
  highlight?: boolean;
  features: string[];
  cta: string;
};

const COMPARISON: Array<{ label: string; free: string | boolean; starter: string | boolean; pro: string | boolean }> = [
  { label: "Resume uploads & ATS scoring", free: "2 / month", starter: "20 / month", pro: "Unlimited" },
  { label: "Job matching & discovery", free: true, starter: true, pro: true },
  { label: "Application packages", free: false, starter: "20 / month", pro: "Unlimited" },
  { label: "AI mock interview (spoken)", free: "Preview", starter: "8 / month", pro: "Unlimited" },
  { label: "Company-specific simulations", free: false, starter: false, pro: true },
  { label: "Interviewer personas & difficulty", free: false, starter: "Selected", pro: "Full control" },
  { label: "Scored reports & transcripts", free: false, starter: true, pro: true },
  { label: "Career analytics history", free: "30 days", starter: "6 months", pro: "Unlimited" },
  { label: "PDF export & mentor sharing", free: false, starter: false, pro: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/60" aria-label="Not included" />;
  return <span className="text-xs text-muted-foreground">{value}</span>;
}

export function PricingSection({
  plans,
  onSelect,
}: {
  plans: Plan[];
  onSelect: (plan: Plan, billing: "monthly" | "annual") => void;
}) {
  const reduce = useReducedMotion();
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [showCompare, setShowCompare] = useState(false);

  return (
    <div className="space-y-8">
      {/* billing toggle */}
      <div
        role="group"
        aria-label="Billing interval"
        className="inline-flex rounded-2xl border border-border bg-secondary/40 p-1"
      >
        {(["monthly", "annual"] as const).map((k) => {
          const isActive = billing === k;
          return (
            <motion.button
              key={k}
              type="button"
              aria-pressed={isActive}
              onClick={() => setBilling(k)}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              transition={spring.snappy}
              className={`relative min-h-11 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="billing-pill"
                  className="absolute inset-0 -z-10 rounded-xl bg-primary"
                  transition={reduce ? { duration: 0 } : spring.layout}
                />
              )}
              <span className="relative">
                {k === "monthly" ? "Monthly" : "Annual"}
                {k === "annual" && <span className="ml-2 text-[11px] opacity-80">save up to 26%</span>}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* plan cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p, i) => {
          const price = p[billing];
          const body = (
            <div className="flex h-full flex-col p-6">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <h3 className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
                  {p.name}
                </h3>
                {p.highlight && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    Most complete
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>

              <div className="mt-6 flex items-baseline gap-2">
                <motion.span
                  key={price.price}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: ease.entrance }}
                  className="font-display text-4xl font-bold tracking-tight tabular-nums text-foreground"
                >
                  {price.price}
                </motion.span>
                <span className="text-sm text-muted-foreground">{price.note}</span>
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <motion.div whileTap={reduce ? undefined : { scale: 0.97 }} transition={spring.snappy} className="mt-6">
                <Button
                  className="group h-12 w-full text-base"
                  variant={p.highlight ? "default" : "outline"}
                  onClick={() => onSelect(p, billing)}
                >
                  {p.cta}
                  <ArrowRight
                    className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    aria-hidden
                  />
                </Button>
              </motion.div>
            </div>
          );

          return (
            <motion.div
              key={p.name}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={reduce ? { duration: 0.2 } : { delay: i * 0.08, duration: 0.65, ease: ease.entrance }}
              whileHover={reduce ? undefined : { y: -6 }}
              className="h-full"
            >
              {p.highlight ? (
                <GlowFrame className="h-full" radius={16}>
                  {body}
                </GlowFrame>
              ) : (
                <Glare className="h-full" radius="16px" background="hsl(var(--card))" borderColor="hsl(var(--border))">
                  {body}
                </Glare>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* comparison matrix */}
      <div className="rounded-2xl border border-border/70 bg-card/50 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setShowCompare((v) => !v)}
          aria-expanded={showCompare}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-5 text-sm font-medium text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          Compare every feature
          <motion.span
            aria-hidden
            animate={{ rotate: showCompare ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : spring.snappy}
            className="text-muted-foreground"
          >
            ▾
          </motion.span>
        </button>

        <motion.div
          initial={false}
          animate={{ height: showCompare ? "auto" : 0, opacity: showCompare ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.4, ease: ease.standard }}
          className="overflow-hidden"
        >
          <div className="overflow-x-auto px-2 pb-4">
            <table className="w-full min-w-[540px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left">
                  <th scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Feature
                  </th>
                  {["Free", "Starter", "Pro"].map((n) => (
                    <th
                      key={n}
                      scope="col"
                      className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-foreground"
                    >
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-border/40 last:border-0">
                    <th scope="row" className="px-3 py-3 text-left text-sm font-normal text-muted-foreground">
                      {row.label}
                    </th>
                    <td className="px-3 py-3 text-center"><Cell value={row.free} /></td>
                    <td className="px-3 py-3 text-center"><Cell value={row.starter} /></td>
                    <td className="px-3 py-3 text-center"><Cell value={row.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default PricingSection;
