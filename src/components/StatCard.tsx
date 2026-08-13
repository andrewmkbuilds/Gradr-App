import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  glowing?: boolean;
}

export function StatCard({ title, value, subtitle, icon: Icon, glowing }: StatCardProps) {
  return (
    <div className={`glass-card p-5 animate-slide-up ${glowing ? "glow-border" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="stat-value text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
      {subtitle && <p className="text-xs text-primary mt-1">{subtitle}</p>}
    </div>
  );
}
