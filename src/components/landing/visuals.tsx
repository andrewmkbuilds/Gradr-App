import {
  FileText, Target, Mic, LineChart, Check, Circle, Sparkles, MapPin,
  Building2, Send, MessageSquare, Camera, Waves, Clock, ArrowRight, Bot,
} from "lucide-react";
import { DepthStage, DepthLayer, FloatPanel } from "@/components/motion/Depth";
import { CountUp } from "@/components/motion/CountUp";

/* ------------------------------ shared shell ------------------------------ */

export function AppFrame({
  title,
  children,
  className = "",
  overlay,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Panels that float in front of the frame on their own depth plane. */
  overlay?: React.ReactNode;
}) {
  return (
    <DepthStage className="rounded-2xl" tilt={5}>
      <div
        className={`depth-surface overflow-hidden rounded-2xl border border-border bg-card shadow-[0_28px_80px_-30px_hsl(0_0%_0%/0.75)] ${className}`}
        role="img"
        aria-label={`Gradr product interface: ${title}`}
      >
        <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <span className="ml-2 truncate text-[11px] font-medium tracking-wide text-muted-foreground">
            {title}
          </span>
        </div>
        <DepthLayer z={18} className="p-3.5 sm:p-5">
          {children}
        </DepthLayer>
      </div>
      {overlay}
    </DepthStage>
  );
}

/**
 * A small readout that floats in front of a product frame on its own plane.
 * Used to lift scores and insights out of the flat UI.
 */
export function FloatingReadout({
  className = "",
  z = 70,
  delay = 0,
  children,
}: {
  className?: string;
  z?: number;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <DepthLayer z={z} className={`pointer-events-none absolute hidden sm:block ${className}`}>
      <FloatPanel distance={7} delay={delay}>
        <div className="depth-surface glass-panel rounded-2xl px-3.5 py-2.5">{children}</div>
      </FloatPanel>
    </DepthLayer>
  );
}

function Meter({ label, value, tone = "primary" }: { label: string; value: number; tone?: "primary" | "success" | "warning" }) {
  const bar =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* --------------------------------- hero ---------------------------------- */

export function HeroWorkspace() {
  return (
    <AppFrame title="gradr — workspace">
      <div className="grid gap-3 sm:grid-cols-5">
        {/* profile + ats */}
        <div className="space-y-3 sm:col-span-2">
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                AR
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">Amara Reid</p>
                <p className="truncate text-[10px] text-muted-foreground">Frontend Engineer · Berlin</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
            <div className="flex items-end justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">ATS score</span>
              <span className="text-2xl font-bold tabular-nums text-primary">86</span>
            </div>
            <div className="mt-2.5 space-y-2">
              <Meter label="Keywords" value={78} />
              <Meter label="Impact" value={91} tone="success" />
              <Meter label="Formatting" value={64} tone="warning" />
            </div>
          </div>
        </div>

        {/* matches + pipeline */}
        <div className="space-y-3 sm:col-span-3">
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Top matches</p>
            <ul className="space-y-1.5">
              {[
                ["Software Engineer · Northwind", 92],
                ["Product Engineer · Volta", 87],
                ["Frontend Developer · Kestrel", 81],
              ].map(([role, score]) => (
                <li key={role as string} className="flex items-center gap-2 rounded-lg bg-background/50 px-2.5 py-2">
                  <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{role}</span>
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                    {score}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Pipeline</p>
              <div className="grid grid-cols-4 items-end gap-1.5" aria-hidden>
                {[
                  ["Saved", 40],
                  ["Applied", 72],
                  ["Intv", 48],
                  ["Offer", 22],
                ].map(([l, h]) => (
                  <div key={l as string} className="flex flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-primary/40" style={{ height: `${h as number}px` }} />
                    <span className="text-[9px] text-muted-foreground">{l}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Interview readiness</p>
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold tabular-nums text-foreground">7.8</span>
                <span className="text-[10px] text-muted-foreground">/ 10</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Last session: System design</p>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ---------------------------- resume intelligence -------------------------- */

export function ResumeVisual() {
  return (
    <AppFrame title="gradr — resume intelligence">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="truncate text-xs text-foreground">amara-reid-resume.pdf</span>
          </div>
          <div className="space-y-2" aria-hidden>
            {[92, 74, 88, 60, 80, 45, 70].map((w, i) => (
              <div key={i} className="h-2 rounded bg-muted" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
            <div className="space-y-2">
              <Meter label="ATS compatibility" value={86} />
              <Meter label="Keyword coverage" value={78} />
              <Meter label="Impact language" value={91} tone="success" />
              <Meter label="Structure & clarity" value={64} tone="warning" />
            </div>
          </div>
          <ul className="space-y-1.5">
            {[
              "Add “TypeScript” and “CI/CD” — both appear in your target roles.",
              "Quantify 3 bullets in your last role.",
              "Merge the two-column header — parsers drop it.",
            ].map((t) => (
              <li key={t} className="flex gap-2 rounded-lg border border-border bg-secondary/30 px-2.5 py-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[11px] leading-snug text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppFrame>
  );
}

/* ------------------------------- job matching ------------------------------ */

const MATCHES = [
  {
    role: "Software Engineer",
    company: "Northwind Labs",
    score: 92,
    location: "Berlin · Hybrid",
    salary: "€68k – €82k",
    have: ["React", "TypeScript", "Node"],
    missing: ["GraphQL"],
  },
  {
    role: "Product Manager",
    company: "Volta Systems",
    score: 87,
    location: "Remote · EU",
    salary: "€60k – €75k",
    have: ["Roadmapping", "Analytics"],
    missing: ["SQL", "A/B testing"],
  },
  {
    role: "Data Analyst",
    company: "Kestrel Health",
    score: 81,
    location: "Amsterdam",
    salary: "Not listed",
    have: ["Python", "Dashboards"],
    missing: ["dbt"],
  },
];

export function MatchVisual() {
  return (
    <AppFrame title="gradr — job matching">
      <ul className="space-y-2.5">
        {MATCHES.map((m) => (
          <li key={m.role} className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{m.role}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {m.company}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {m.location}
                  </span>
                  <span>{m.salary}</span>
                </p>
              </div>
              <span className="rounded-md bg-primary/15 px-2 py-1 text-[11px] font-bold tabular-nums text-primary">
                {m.score}% match
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {m.have.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
                  <Check className="h-2.5 w-2.5" />
                  {s}
                </span>
              ))}
              {m.missing.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                  <Circle className="h-2.5 w-2.5" />
                  {s}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </AppFrame>
  );
}

/* --------------------------- application engine ---------------------------- */

const APP_STEPS = [
  { icon: FileText, label: "Job description", note: "Paste a link or description" },
  { icon: Sparkles, label: "Tailored resume", note: "Bullets rewritten for the role" },
  { icon: Send, label: "Cover letter", note: "Specific, not generic" },
  { icon: MessageSquare, label: "Recruiter message", note: "Short outreach draft" },
  { icon: LineChart, label: "Tracker", note: "Added to your pipeline" },
];

export function ApplicationVisual() {
  return (
    <AppFrame title="gradr — application engine">
      <ol className="space-y-2">
        {APP_STEPS.map((s, i) => (
          <li key={s.label}>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15">
                <s.icon className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-foreground">{s.label}</p>
                <p className="truncate text-[10px] text-muted-foreground">{s.note}</p>
              </div>
            </div>
            {i < APP_STEPS.length - 1 && (
              <div className="ml-6 h-3 w-px bg-border" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </AppFrame>
  );
}

/* ----------------------------- interview studio ---------------------------- */

export function InterviewVisual() {
  return (
    <AppFrame title="gradr — ai mock interview">
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-background/60 p-5">
            <div className="flex flex-col items-center gap-3">
              <span className="relative grid h-16 w-16 place-items-center rounded-full bg-primary/15">
                <span className="absolute inset-0 rounded-full border border-primary/30" />
                <span className="absolute -inset-2 rounded-full border border-primary/15" />
                <Bot className="h-7 w-7 text-primary" />
              </span>
              <p className="text-[11px] font-medium text-foreground">Senior Engineering Interviewer</p>
              <div className="flex h-8 items-end gap-1" aria-hidden>
                {[10, 22, 14, 30, 18, 26, 12, 24, 16, 28, 11, 20].map((h, i) => (
                  <span key={i} className="w-1 rounded-full bg-primary/60" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-secondary/70 px-2 py-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] tabular-nums text-muted-foreground">18:42</span>
            </div>
            <div className="absolute bottom-3 left-3 flex h-14 w-20 items-center justify-center rounded-lg border border-border bg-secondary/70">
              <Camera className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Live transcript</p>
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-primary">Interviewer:</span> Walk me through a time a deploy
                went wrong. What did you actually do first?
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">You:</span> We saw error rates spike about two
                minutes after rollout, so I rolled back before debugging…
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground/70">
                <span className="font-semibold text-primary">Interviewer:</span> Good — how did you decide rollback
                over a hotfix?
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2.5 text-[10px] uppercase tracking-widest text-muted-foreground">Communication</p>
            <div className="space-y-2">
              <Meter label="Clarity" value={84} />
              <Meter label="Structure" value={71} tone="warning" />
              <Meter label="Pace" value={90} tone="success" />
              <Meter label="Specificity" value={76} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Post-interview report</p>
            <ul className="space-y-1.5 text-[10px] leading-snug text-muted-foreground">
              <li className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />Strong incident narrative</li>
              <li className="flex gap-1.5"><Waves className="mt-0.5 h-3 w-3 shrink-0 text-warning" />Use STAR for behavioural answers</li>
              <li className="flex gap-1.5"><ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" />Next: 3 system design prompts</li>
            </ul>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ----------------------------- career assistant ---------------------------- */

export function AssistantVisual() {
  return (
    <AppFrame title="gradr — career assistant">
      <div className="space-y-2.5">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3 py-2">
          <p className="text-[11px] leading-snug text-foreground">Why am I getting rejected after first-round screens?</p>
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-secondary/40 px-3 py-2.5">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Across your last 9 applications, you reached a screen 4 times and stopped there. Two patterns show up in
            your practice transcripts:
          </p>
          <ul className="mt-2 space-y-1 text-[11px] leading-snug text-muted-foreground">
            <li>• Answers average 2:10 — screens reward 60–90 seconds.</li>
            <li>• You describe the team's work, rarely your own decision.</li>
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Start with a 3-question timed drill on ownership framing.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Which skills should I learn next?", "What should I practice tonight?", "Rewrite my summary"].map((q) => (
            <span key={q} className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[10px] text-muted-foreground">
              {q}
            </span>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}

/* --------------------------------- analytics ------------------------------- */

export function AnalyticsVisual() {
  const bars = [38, 46, 42, 58, 55, 67, 72, 78];
  return (
    <AppFrame title="gradr — career analytics">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["ATS health", "86", "+8 this month"],
          ["Applications", "24", "6 in interview"],
          ["Interview score", "7.8", "+1.4 in 4 sessions"],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
            <p className="text-[10px] text-primary">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-3">
        <p className="mb-2.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          Interview performance trend
        </p>
        <div className="flex h-24 items-end gap-1.5" aria-hidden>
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary/40" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Competencies</p>
          <div className="space-y-2">
            <Meter label="Problem solving" value={82} />
            <Meter label="Communication" value={74} />
            <Meter label="Ownership" value={61} tone="warning" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Job readiness</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Frontend Engineer roles: <span className="font-semibold text-foreground">ready to apply</span>. Backend-heavy
            roles: 2 skill gaps remaining.
          </p>
        </div>
      </div>
    </AppFrame>
  );
}
