/**
 * Motion playground — a live workbench for the shared motion system.
 *
 * Preview every spring preset, easing curve and page-transition variant with
 * the real tokens from `@/lib/motion`, tune depth intensity, and watch frame
 * timing while you do it. Internal tool, but safe for any signed-in user.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  duration,
  ease,
  fadeIn,
  fadeUp,
  pageVariants,
  reducedPageVariants,
  scaleIn,
  spring,
} from "@/lib/motion";
import { useMotionPrefs } from "@/hooks/useMotionPrefs";
import { useFrameStats } from "@/components/motion/PerfDiagnostics";
import { DepthCard, DepthScene } from "@/components/motion/depth";

type SpringKey = keyof typeof spring;
type EaseKey = keyof typeof ease;

const SPRING_KEYS = Object.keys(spring) as SpringKey[];
const EASE_KEYS = Object.keys(ease) as EaseKey[];

const VARIANTS = {
  page: pageVariants,
  reducedPage: reducedPageVariants,
  fadeUp,
  fadeIn,
  scaleIn,
} as const;

type VariantKey = keyof typeof VARIANTS;

export default function MotionPlayground() {
  const { reduceMotion, depth, setDepth, mode } = useMotionPrefs();
  const stats = useFrameStats(true);

  const [springKey, setSpringKey] = useState<SpringKey>("smooth");
  const [easeKey, setEaseKey] = useState<EaseKey>("standard");
  const [easeDuration, setEaseDuration] = useState<number>(duration.base);
  const [variantKey, setVariantKey] = useState<VariantKey>("page");
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(true);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Motion playground</h1>
        <p className="text-sm text-muted-foreground">
          Every spring, easing curve and transition variant Gradr ships, running live against the
          shared tokens. Frame timing updates twice a second.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{stats.fps} fps</Badge>
          <Badge variant="secondary">worst {stats.worstMs}ms</Badge>
          <Badge variant="secondary">dropped {stats.dropped}</Badge>
          <Badge variant={reduceMotion ? "destructive" : "secondary"}>
            {reduceMotion ? "reduced motion" : `motion: ${mode}`}
          </Badge>
        </div>
      </header>

      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Springs</h2>
        <div className="flex flex-wrap gap-2">
          {SPRING_KEYS.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={springKey === k ? "default" : "outline"}
              onClick={() => {
                setSpringKey(k);
                setRun((r) => r + 1);
              }}
            >
              {k}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setRun((r) => r + 1)}>
            <Play className="mr-1 h-3.5 w-3.5" aria-hidden />
            Replay
          </Button>
        </div>
        <div className="relative h-24 overflow-hidden rounded-xl border border-border/70 bg-muted/20">
          <motion.div
            key={`spring-${springKey}-${run}`}
            initial={{ x: 0 }}
            animate={{ x: reduceMotion ? 0 : "calc(100% - 3.5rem)" }}
            transition={reduceMotion ? { duration: 0.15 } : spring[springKey]}
            className="absolute top-1/2 left-3 h-12 w-12 -translate-y-1/2 rounded-xl bg-primary"
          />
        </div>
        <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          {JSON.stringify(spring[springKey], null, 2)}
        </pre>
      </section>

      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Easing curves</h2>
        <div className="flex flex-wrap gap-2">
          {EASE_KEYS.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={easeKey === k ? "default" : "outline"}
              onClick={() => {
                setEaseKey(k);
                setRun((r) => r + 1);
              }}
            >
              {k}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ease-duration" className="text-xs">
            Duration · {easeDuration.toFixed(2)}s
          </Label>
          <Slider
            id="ease-duration"
            min={5}
            max={150}
            step={5}
            value={[Math.round(easeDuration * 100)]}
            onValueChange={([v]) => setEaseDuration((v ?? 28) / 100)}
          />
        </div>
        <div className="relative h-24 overflow-hidden rounded-xl border border-border/70 bg-muted/20">
          <motion.div
            key={`ease-${easeKey}-${easeDuration}-${run}`}
            initial={{ x: 0 }}
            animate={{ x: reduceMotion ? 0 : "calc(100% - 3.5rem)" }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { duration: easeDuration, ease: [...ease[easeKey]] as [number, number, number, number] }
            }
            className="absolute top-1/2 left-3 h-12 w-12 -translate-y-1/2 rounded-xl bg-accent"
          />
        </div>
      </section>

      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Transition variants</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VARIANTS) as VariantKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={variantKey === k ? "default" : "outline"}
              onClick={() => setVariantKey(k)}
            >
              {k}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setShown((s) => !s)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
            Toggle
          </Button>
        </div>
        <div className="min-h-[9rem] rounded-xl border border-border/70 bg-muted/20 p-4">
          <AnimatePresence mode="wait">
            {shown && (
              <motion.div
                key={variantKey}
                variants={reduceMotion ? reducedPageVariants : VARIANTS[variantKey]}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={reduceMotion ? { duration: 0.15 } : spring[springKey]}
                className="rounded-lg bg-card p-4 text-sm text-foreground shadow-sm"
              >
                Sample surface using <code>{variantKey}</code> with the{" "}
                <code>{springKey}</code> spring.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Depth</h2>
        <div className="space-y-2">
          <Label htmlFor="playground-depth" className="text-xs">
            Intensity · {Math.round(depth * 100)}%
          </Label>
          <Slider
            id="playground-depth"
            min={0}
            max={100}
            step={5}
            disabled={reduceMotion}
            value={[Math.round(depth * 100)]}
            onValueChange={([v]) => setDepth((v ?? 0) / 100)}
          />
        </div>
        <DepthScene className="grid gap-4 sm:grid-cols-2">
          <DepthCard className="rounded-xl border border-border/70 bg-card p-5">
            <p className="text-sm font-medium text-foreground">Tilt card</p>
            <p className="text-xs text-muted-foreground">Hover with a fine pointer to tilt.</p>
          </DepthCard>
          <DepthCard className="rounded-xl border border-border/70 bg-card p-5">
            <p className="text-sm font-medium text-foreground">Second surface</p>
            <p className="text-xs text-muted-foreground">
              Depth is disabled automatically on touch and low-power devices.
            </p>
          </DepthCard>
        </DepthScene>
      </section>
    </div>
  );
}
