import { LucideIcon } from "lucide-react";
import { CountUp, SpotlightCard, DepthCard } from "@/components/motion";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  glowing?: boolean;
}

/** Parses "42", "42%", "4.2x" into a countable number + suffix; returns null for "—". */
function parseMetric(value: string | number) {
  if (typeof value === "number") return { n: value, suffix: "", decimals: 0 };
  const m = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  if (!m) return null;
  const raw = m[1] ?? "0";
  return { n: Number(raw), suffix: m[2] ?? "", decimals: raw.includes(".") ? 1 : 0 };
}

export function StatCard({ title, value, subtitle, icon: Icon, glowing }: StatCardProps) {
  const metric = parseMetric(value);

  return (
    <DepthCard
      tilt={4}
      lift={5}
      innerClassName={`lume-border glass-panel reflect overflow-hidden ${glowing ? "shadow-[var(--shadow-glow)]" : ""}`}
    >
      <SpotlightCard className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
          </div>
        </div>
        <p className="font-display text-3xl font-bold tracking-tight text-foreground">
          {metric ? (
            <CountUp value={metric.n} decimals={metric.decimals} suffix={metric.suffix} duration={0.9} />
          ) : (
            value
          )}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{title}</p>
        {subtitle && <p className="accent-text mt-1 text-xs font-medium">{subtitle}</p>}
      </SpotlightCard>
    </DepthCard>
  );
}
