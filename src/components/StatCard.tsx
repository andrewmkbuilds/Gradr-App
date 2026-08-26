import { LucideIcon } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { CountUp } from "@/components/motion";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  glowing?: boolean;
}

export function StatCard({ title, value, subtitle, icon: Icon, glowing }: StatCardProps) {
  // Pure numeric values animate; formatted strings ("—", "82%") render as-is.
  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null;

  return (
    <Surface
      level={2}
      interactive
      className={glowing ? "border-primary/25 shadow-[var(--shadow-glow)]" : undefined}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="stat-value text-foreground">
        {numeric !== null ? <CountUp to={numeric} duration={1.1} /> : value}
      </p>
      <p className="mt-1 text-body-sm text-muted-foreground">{title}</p>
      {subtitle && <p className="mt-1 text-caption text-primary">{subtitle}</p>}
    </Surface>
  );
}
