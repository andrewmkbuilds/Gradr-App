/**
 * Motion & performance controls.
 *
 * Gives users an explicit override on top of the OS `prefers-reduced-motion`
 * setting, a depth-intensity dial for the 3D/spatial system, and an opt-in
 * on-device diagnostics overlay (FPS / dropped frames).
 */
import { Gauge, MonitorSmartphone, Sparkles, Zap } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router-compat";
import { useMotionPrefs, type MotionMode } from "@/hooks/useMotionPrefs";
import { cn } from "@/lib/utils";

const MODES: { value: MotionMode; label: string; hint: string; icon: typeof Zap }[] = [
  { value: "system", label: "Match system", hint: "Follow your OS setting", icon: MonitorSmartphone },
  { value: "full", label: "Full motion", hint: "All animations and depth", icon: Sparkles },
  { value: "reduced", label: "Reduced", hint: "Fades only, no movement", icon: Gauge },
];

export function MotionPanel() {
  const {
    mode,
    setMode,
    depth,
    setDepth,
    diagnostics,
    setDiagnostics,
    systemReduced,
    reduceMotion,
  } = useMotionPrefs();

  return (
    <section aria-labelledby="motion-heading" className="glass-card space-y-5 p-6">
      <div>
        <h2 id="motion-heading" className="text-lg font-semibold text-foreground">
          Motion &amp; performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how much Gradr moves. Changes apply instantly across the app and are remembered
          on this device.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(m.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/70 hover:border-primary/40",
              )}
            >
              <m.icon className="h-4 w-4 text-primary" aria-hidden />
              <p className="mt-2 text-sm font-medium text-foreground">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.hint}</p>
            </button>
          );
        })}
      </div>

      {mode === "system" && (
        <p className="text-xs text-muted-foreground">
          Your system currently requests{" "}
          <Badge variant="secondary" className="text-[10px]">
            {systemReduced ? "reduced motion" : "full motion"}
          </Badge>
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="depth-intensity" className="text-sm">
            3D depth intensity
          </Label>
          <span className="text-xs text-muted-foreground">
            {reduceMotion ? "Off (reduced motion)" : `${Math.round(depth * 100)}%`}
          </span>
        </div>
        <Slider
          id="depth-intensity"
          min={0}
          max={100}
          step={5}
          disabled={reduceMotion}
          value={[Math.round(depth * 100)]}
          onValueChange={([v]) => setDepth((v ?? 0) / 100)}
          aria-label="3D depth intensity"
        />
        <p className="text-xs text-muted-foreground">
          Lowers parallax, tilt and magnetic hover strength. Set to 0% for a completely flat
          interface.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3">
        <div>
          <Label htmlFor="perf-diagnostics" className="text-sm">
            Performance diagnostics overlay
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Shows live FPS, dropped frames and depth activation status on this device.
          </p>
        </div>
        <Switch id="perf-diagnostics" checked={diagnostics} onCheckedChange={setDiagnostics} />
      </div>

      <Button asChild variant="outline" size="sm">
        <Link to="/motion-playground">Open motion playground</Link>
      </Button>
    </section>
  );
}

export default MotionPanel;
