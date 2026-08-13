/**
 * Header-level reduced-motion switch.
 *
 * The full control lives in Settings, but accessibility preferences shouldn't
 * be buried: this exposes the same `useMotionPrefs` state as a one-click
 * toggle in every shell (public, app, auth). Clicking flips between
 * "reduced" and "full"; the menu keeps "Match system" reachable.
 */
import { Gauge, MonitorSmartphone, Sparkles, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/lib/router-compat";
import { useMotionPrefs, type MotionMode } from "@/hooks/useMotionPrefs";
import { cn } from "@/lib/utils";

const OPTIONS: { value: MotionMode; label: string; icon: typeof Waves }[] = [
  { value: "system", label: "Match system", icon: MonitorSmartphone },
  { value: "full", label: "Full motion", icon: Sparkles },
  { value: "reduced", label: "Reduced motion", icon: Gauge },
];

export function MotionQuickToggle({ className }: { className?: string }) {
  const { mode, setMode, reduceMotion } = useMotionPrefs();
  const Icon = reduceMotion ? Gauge : Waves;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Motion: ${reduceMotion ? "reduced" : "full"}. Change motion preference`}
          className={cn(
            "interactive press-scale min-h-11 min-w-11 text-muted-foreground hover:text-foreground",
            reduceMotion && "text-accent",
            className,
          )}
        >
          <Icon className="h-[1.1rem] w-[1.1rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Motion
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as MotionMode)}>
          {OPTIONS.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2 text-sm">
              <OptionIcon className="h-4 w-4" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-xs text-muted-foreground">
          <Link to="/settings">More motion settings</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default MotionQuickToggle;
