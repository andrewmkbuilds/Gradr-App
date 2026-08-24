import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Slider } from "@/components/ui/slider";
import { Surface } from "@/components/ui/surface";
import { MotionSegmentedControl } from "@/components/MotionToggle";
import { Magnetic, Reveal, TextReveal, TiltCard } from "@/components/motion";
import { EmptyState, ErrorState, LoadingDots, SkeletonPanel } from "@/components/states";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import {
  duration,
  easeInOut,
  easeOut,
  springPointer,
  springSmooth,
  springSnappy,
  springSoft,
} from "@/lib/motion/tokens";

const SPRINGS = {
  snappy: springSnappy,
  smooth: springSmooth,
  soft: springSoft,
  pointer: springPointer,
} as const;

type SpringName = keyof typeof SPRINGS;

const PAGE_VARIANTS = {
  fadeUp: { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } },
  scaleIn: { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 } },
  slideLeft: { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 } },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
} as const;

type VariantName = keyof typeof PAGE_VARIANTS;

/**
 * Internal tuning surface for the Gradr motion language. Preview every shared
 * spring, easing and page transition, and see how each degrades under the
 * reduced-motion preference.
 */
export default function MotionPlayground() {
  const reduced = useReducedMotionPref();
  const [spring, setSpring] = useState<SpringName>("smooth");
  const [stiffness, setStiffness] = useState(SPRINGS.smooth.stiffness as number);
  const [damping, setDamping] = useState(SPRINGS.smooth.damping as number);
  const [mass, setMass] = useState((SPRINGS.smooth.mass as number) * 100);
  const [variant, setVariant] = useState<VariantName>("fadeUp");
  const [replayKey, setReplayKey] = useState(0);
  const [toggled, setToggled] = useState(false);

  const tuned = { type: "spring" as const, stiffness, damping, mass: mass / 100 };

  const pickSpring = (name: SpringName) => {
    const preset = SPRINGS[name];
    setSpring(name);
    setStiffness(preset.stiffness as number);
    setDamping(preset.damping as number);
    setMass(((preset.mass as number) ?? 1) * 100);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-secondary">Internal</p>
        <TextReveal as="h1" className="font-display text-3xl text-foreground" text="Motion playground" />
        <p className="max-w-2xl text-sm text-muted-foreground">
          Preview and tune the shared springs, easings, transitions and loading states. Changes here are
          previews only — commit new values to <code className="text-xs">src/lib/motion/tokens.ts</code>.
        </p>
      </header>

      <Surface level={3} className="space-y-4 p-6">
        <h2 className="text-h6 text-foreground">Motion preference</h2>
        <MotionSegmentedControl />
      </Surface>

      <Surface level={3} className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h6 text-foreground">Springs</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SPRINGS) as SpringName[]).map((name) => (
              <Button
                key={name}
                size="sm"
                variant={spring === name ? "default" : "outline"}
                className="interactive press-scale capitalize"
                onClick={() => pickSpring(name)}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <LabeledSlider label="Stiffness" value={stiffness} min={40} max={800} step={10} onChange={setStiffness} />
          <LabeledSlider label="Damping" value={damping} min={5} max={60} step={1} onChange={setDamping} />
          <LabeledSlider label="Mass ×100" value={mass} min={30} max={250} step={5} onChange={setMass} />
        </div>

        <div className="relative h-24 overflow-hidden rounded-xl border border-border bg-surface-secondary">
          <motion.div
            className="absolute top-1/2 h-12 w-12 -translate-y-1/2 rounded-xl bg-primary"
            animate={{ left: toggled ? "calc(100% - 4rem)" : "1rem" }}
            transition={reduced ? { duration: 0 } : tuned}
          />
        </div>
        <Button className="interactive press-scale" onClick={() => setToggled((value) => !value)}>
          Play spring
        </Button>
        <p className="text-xs text-muted-foreground">
          {`{ type: "spring", stiffness: ${stiffness}, damping: ${damping}, mass: ${(mass / 100).toFixed(2)} }`}
        </p>
      </Surface>

      <Surface level={3} className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h6 text-foreground">Page transitions</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PAGE_VARIANTS) as VariantName[]).map((name) => (
              <Button
                key={name}
                size="sm"
                variant={variant === name ? "default" : "outline"}
                className="interactive press-scale"
                onClick={() => {
                  setVariant(name);
                  setReplayKey((key) => key + 1);
                }}
              >
                {name}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="interactive press-scale gap-1.5"
              onClick={() => setReplayKey((key) => key + 1)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Replay
            </Button>
          </div>
        </div>
        <div className="min-h-[8rem] overflow-hidden rounded-xl border border-border bg-surface-secondary p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${variant}-${replayKey}`}
              initial={reduced ? { opacity: 0 } : PAGE_VARIANTS[variant].initial}
              animate={PAGE_VARIANTS[variant].animate}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.12 : duration.base, ease: easeOut }}
              className="rounded-lg bg-surface p-5 text-sm text-foreground shadow-sm"
            >
              Route content using the <strong>{variant}</strong> variant.
            </motion.div>
          </AnimatePresence>
        </div>
      </Surface>

      <Surface level={3} className="space-y-5 p-6">
        <h2 className="text-h6 text-foreground">Easings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { name: "easeOut", curve: easeOut },
            { name: "easeInOut", curve: easeInOut },
          ].map(({ name, curve }) => (
            <div key={name} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{name}</p>
              <div className="relative h-12 overflow-hidden rounded-lg border border-border bg-surface-secondary">
                <motion.div
                  key={`${name}-${replayKey}`}
                  className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-brand-secondary"
                  initial={{ left: "0.5rem" }}
                  animate={{ left: "calc(100% - 2rem)" }}
                  transition={reduced ? { duration: 0 } : { duration: duration.slow, ease: [...curve] }}
                />
              </div>
            </div>
          ))}
        </div>
      </Surface>

      <Surface level={3} className="space-y-5 p-6">
        <h2 className="text-h6 text-foreground">Primitives</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <TiltCard className="rounded-xl border border-border bg-surface-secondary p-5 text-sm text-foreground">
            TiltCard — pointer parallax
          </TiltCard>
          <Magnetic className="flex items-center justify-center rounded-xl border border-border bg-surface-secondary p-5 text-sm text-foreground">
            Magnetic hover
          </Magnetic>
          <Reveal className="rounded-xl border border-border bg-surface-secondary p-5 text-sm text-foreground">
            Reveal on scroll
          </Reveal>
        </div>
      </Surface>

      <Surface level={3} className="space-y-6 p-6">
        <h2 className="text-h6 text-foreground">Loading, empty and error states</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonPanel lines={3} />
          <EmptyState title="Nothing here yet" description="Empty-state pattern used across engines." />
          <ErrorState onRetry={() => setReplayKey((key) => key + 1)} />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Inline loading <LoadingDots />
        </div>
      </Surface>
    </div>
  );
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <label htmlFor={`slider-${label}`}>{label}</label>
        <span className="tabular-nums text-foreground">{value}</span>
      </div>
      <Slider
        id={`slider-${label}`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />
    </div>
  );
}
