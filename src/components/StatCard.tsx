import { LucideIcon } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { CountUp } from "@/components/motion";
import { Text } from "@/design-system/gradr-9b9b95";

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
      className={glowing ? "border-primary/30 shadow-raise" : undefined}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-control bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="stat-value text-foreground">
        {numeric !== null ? <CountUp to={numeric} duration={1.1} /> : value}
      </p>
      <Text variant="body-sm" tone="muted" className="mt-1">{title}</Text>
      {subtitle && <Text variant="caption" tone="primary" className="mt-1">{subtitle}</Text>}
    </Surface>
  );
}
