/**
 * "Peel back the old resume" — the one high-impact peel interaction on the
 * landing page.
 *
 * The top sheet is a resume as most people submit it. Peeling from the right
 * edge reveals the same resume after Gradr's rewrite, so the interaction pays
 * off with real content rather than being a gimmick.
 *
 * Both sheets are ordinary DOM. When the peel cannot run, the two versions are
 * shown side by side instead, which is the same information without the
 * interaction.
 */

import { ArrowLeftRight, Check, Sparkles, X } from "lucide-react";

import { PeelFx } from "@/components/canvasui/CanvasFx";
import { CanvasFxFrame } from "@/components/canvasui/CanvasFxFrame";
import { cn } from "@/lib/utils";

/* ------------------------------- resume data ------------------------------ */

const BEFORE_BULLETS = [
  "Responsible for managing the team's social media accounts.",
  "Helped with various marketing tasks as needed.",
  "Worked on improving the company website.",
];

const AFTER_BULLETS = [
  "Grew social reach 3.4x (12k to 41k followers) across 3 channels in 8 months.",
  "Ran 14 A/B tested campaigns; lifted qualified signups 27% quarter over quarter.",
  "Rebuilt the marketing site in Next.js, cutting load time 4.1s to 0.9s.",
];

const BEFORE_FLAGS = [
  "No measurable outcomes",
  "Passive phrasing",
  "Missing role keywords",
];

const AFTER_WINS = [
  "Quantified impact",
  "Strong action verbs",
  "Matches the job description",
];

/* -------------------------------- sub views ------------------------------- */

function SheetChrome({
  label,
  score,
  tone,
}: {
  label: string;
  score: number;
  tone: "muted" | "brand";
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.2em]",
          tone === "brand" ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        ATS score
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-bold tabular-nums",
            tone === "brand"
              ? "bg-primary/15 text-primary"
              : "bg-mahogany/10 text-mahogany",
          )}
        >
          {score}
        </span>
      </span>
    </div>
  );
}

function SheetBody({
  bullets,
  notes,
  tone,
}: {
  bullets: string[];
  notes: string[];
  tone: "muted" | "brand";
}) {
  const NoteIcon = tone === "brand" ? Check : X;
  return (
    <div className="space-y-4 px-5 py-4">
      <div>
        <p className="font-display text-base font-semibold text-foreground">
          Marketing Associate
        </p>
        <p className="text-[11px] text-muted-foreground">
          Northwind Labs · 2023 — Present
        </p>
      </div>

      <ul className="space-y-2">
        {bullets.map((b) => (
          <li
            key={b}
            className={cn(
              "border-l-2 pl-3 text-[12.5px] leading-relaxed",
              tone === "brand"
                ? "border-primary/50 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {b}
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
        {notes.map((n) => (
          <li
            key={n}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
              tone === "brand"
                ? "bg-primary/10 text-primary"
                : "bg-mahogany/10 text-mahogany",
            )}
          >
            <NoteIcon className="h-3 w-3" aria-hidden />
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BeforeSheet({ heading = false }: { heading?: boolean }) {
  return (
    <article className="h-full bg-card">
      {heading && (
        <h3 className="sr-only">Resume before Gradr</h3>
      )}
      <SheetChrome label="Before · your draft" score={54} tone="muted" />
      <SheetBody bullets={BEFORE_BULLETS} notes={BEFORE_FLAGS} tone="muted" />
    </article>
  );
}

function AfterSheet({ heading = false }: { heading?: boolean }) {
  return (
    <article className="h-full bg-card">
      {heading && <h3 className="sr-only">Resume after Gradr</h3>}
      <SheetChrome label="After · Gradr rewrite" score={92} tone="brand" />
      <SheetBody bullets={AFTER_BULLETS} notes={AFTER_WINS} tone="brand" />
    </article>
  );
}

/**
 * Non-canvas presentation: both versions, side by side, always readable.
 * This is what the large majority of visitors see, so it is designed to stand
 * on its own rather than to look like a degraded state.
 */
function ComparisonFallback() {
  return (
    <div className="grid h-full grid-rows-2 divide-y divide-border/60 sm:grid-cols-2 sm:grid-rows-1 sm:divide-x sm:divide-y-0">
      <BeforeSheet heading />
      <div className="relative">
        <span
          aria-hidden
          className="absolute -left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-border bg-surface p-1.5 text-primary shadow-sm sm:block"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </span>
        <AfterSheet heading />
      </div>
    </div>
  );
}

/* --------------------------------- export --------------------------------- */

export function ResumeTransform({ className }: { className?: string }) {
  return (
    <CanvasFxFrame
      className={className}
      glow="strong"
      hint={
        <>
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
          Move your cursor to the right edge to peel
        </>
      }
    >
      <PeelFx
        className="h-[340px] w-full sm:h-[300px]"
        options={{
          side: "right",
          mode: "cursor",
          reveal: 300,
          zone: 240,
          curl: 260,
          bow: 60,
          shade: 0.55,
          shine: 0.45,
          perspective: 900,
          smoothing: 0.35,
        }}
        under={<AfterSheet />}
        fallback={<ComparisonFallback />}
      >
        <BeforeSheet />
      </PeelFx>
    </CanvasFxFrame>
  );
}
