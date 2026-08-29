import { useState } from "react";
import {
  AlertTriangle,
  Anchor,
  Bell,
  Check,
  Compass,
  Info,
  Search,
  Ship,
  Sparkles,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { MetricBar } from "@/components/app/MetricBar";
import { ScoreDial } from "@/components/app/ScoreDial";
import { StatTile } from "@/components/app/StatTile";
import { EmptyState, ErrorState, SkeletonPanel, LoadingDots } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/* -------------------------------------------------------------------------- */

function Section({ id, title, blurb, children }: { id: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="font-display text-xl tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, label, className }: { token: string; label: string; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-16 rounded-lg border border-border-subtle ${className}`} />
      <p className="text-xs font-medium text-foreground">{label}</p>
      <code className="block text-[11px] text-muted-foreground">{token}</code>
    </div>
  );
}

const SURFACE_TOKENS = [
  { token: "--background", label: "Background", className: "bg-background" },
  { token: "--surface", label: "Surface", className: "bg-surface" },
  { token: "--surface-secondary", label: "Surface secondary", className: "bg-surface-secondary" },
  { token: "--muted", label: "Muted", className: "bg-muted" },
];

const BRAND_TOKENS = [
  { token: "--primary · #245F73", label: "Ocean Teal", className: "bg-primary" },
  { token: "--primary-hover", label: "Ocean Teal hover", className: "bg-primary-hover" },
  { token: "--brand-secondary · #733E24", label: "Mahogany", className: "bg-brand-secondary" },
  { token: "--brand-secondary-soft", label: "Mahogany soft", className: "bg-brand-secondary-soft" },
];

const STATUS_TOKENS = [
  { token: "--success", label: "Success", className: "bg-success" },
  { token: "--warning", label: "Warning", className: "bg-warning" },
  { token: "--destructive", label: "Error", className: "bg-destructive" },
  { token: "--info", label: "Info", className: "bg-info" },
];

const CHART_TOKENS = [1, 2, 3, 4, 5, 6].map((n) => ({
  token: `--chart-${n}`,
  label: `Chart ${n}`,
  className: `bg-chart-${n}`,
}));

/**
 * The Gradr design system reference. One page that shows every token and
 * primitive in the Yacht Club language — the source of truth for anything
 * built after this point.
 */
export default function DesignSystem() {
  const [checked, setChecked] = useState(true);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-6xl space-y-12 pb-16">
        <PageHeader
          eyebrow="Design system"
          icon={<Anchor className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Yacht Club"
          description="Ocean Teal, Mahogany, Soft White and Cool Gray, extended with a restrained maritime support palette. Every component in Gradr resolves through these tokens — change the token, not the component."
        />

        <Button variant="outline" size="sm" asChild>
          <a href="/admin/design-system/color-usage">Read the mahogany vs teal guidelines</a>
        </Button>



        <Section id="color" title="Color" blurb="Four foundation colors, derived surfaces, and status signals tuned to stay in the same family.">
          <div className="space-y-6">
            {[
              ["Foundation", BRAND_TOKENS],
              ["Surfaces", SURFACE_TOKENS],
              ["Status", STATUS_TOKENS],
              ["Data visualisation", CHART_TOKENS],
            ].map(([label, tokens]) => (
              <div key={label as string}>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-secondary">
                  {label as string}
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                  {(tokens as typeof BRAND_TOKENS).map((t) => (
                    <Swatch key={t.token} {...t} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="typography" title="Typography" blurb="Bricolage Grotesque carries display and headings; Geist runs the interface. Never mix them inside one block of text.">
          <Surface level={2} className="space-y-5 p-6">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Display · Bricolage</p>
              <p className="font-display text-4xl tracking-tight text-foreground">Chart your next move</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">H1 · page title</p>
              <p className="font-display text-3xl tracking-tight text-foreground">Resume Intelligence</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">H2 / H3 · sections</p>
              <p className="font-display text-xl tracking-tight text-foreground">Keyword coverage</p>
              <p className="text-base font-semibold text-foreground">Missing from your resume</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Body · Geist</p>
              <p className="max-w-prose text-sm leading-relaxed text-foreground/90">
                Body copy sits at 14–16px with generous leading. Keep measure under ~70 characters so long-form
                guidance stays readable on every breakpoint.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Label</p>
                <span className="text-xs font-medium text-foreground">Target role</span>
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Metadata</p>
                <span className="text-[11px] text-muted-foreground">Updated 3 minutes ago</span>
              </div>
            </div>
          </Surface>
        </Section>

        <Section id="elevation" title="Elevation" blurb="Four levels only. L1 canvas, L2 resting card, L3 feature panel, L4 floating overlay.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([1, 2, 3, 4] as const).map((level) => (
              <Surface key={level} level={level} className="space-y-1">
                <p className="font-display text-base text-foreground">Level {level}</p>
                <p className="text-xs text-muted-foreground">
                  {["Canvas", "Resting card", "Feature panel", "Floating / overlay"][level - 1]}
                </p>
              </Surface>
            ))}
          </div>
        </Section>

        <Section id="cards" title="Cards" blurb="Card tone communicates rank. Only one insight card per screen.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["insight", "Primary insight", "Deep teal surface for the single most important readout."],
                ["default", "Standard card", "Resting neutral surface for most content."],
                ["highlight", "Highlight", "Mahogany accent for a brand or upgrade moment."],
                ["warning", "Needs attention", "Muted warm accent, never alarming."],
                ["danger", "Problem", "Reserved for genuine failures."],
                ["data", "Data surface", "Flat surface for tables and dense readouts."],
              ] as const
            ).map(([tone, title, body]) => (
              <Card key={tone} tone={tone}>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>tone=&quot;{tone}&quot;</CardDescription>
                </CardHeader>
                <CardContent className="text-sm opacity-90">{body}</CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="buttons" title="Buttons" blurb="Ocean Teal for the primary action. Mahogany accent at most once per surface.">
          <Surface level={2} className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="success">Success</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Search">
                <Search />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Delete">
                <Trash2 />
              </Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </div>
          </Surface>
        </Section>

        <Section id="forms" title="Forms" blurb="One field language: 44px targets, hairline borders, teal focus ring, inline validation.">
          <Surface level={2} className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ds-role">Target role</Label>
              <Input id="ds-role" placeholder="Senior Product Designer" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-seniority">Seniority</Label>
              <Select>
                <SelectTrigger id="ds-seniority">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mid">Mid-level</SelectItem>
                  <SelectItem value="senior">Senior</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ds-notes">Notes</Label>
              <Textarea id="ds-notes" placeholder="Paste a job description…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-invalid">Invalid field</Label>
              <Input id="ds-invalid" aria-invalid defaultValue="not-an-email" />
              <p className="text-xs text-destructive">Enter a valid work email address.</p>
            </div>
            <div className="flex items-center gap-6 pt-6">
              <div className="flex items-center gap-2">
                <Checkbox id="ds-check" checked={checked} onCheckedChange={(v) => setChecked(Boolean(v))} />
                <Label htmlFor="ds-check" className="text-sm">Remote only</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ds-switch" defaultChecked />
                <Label htmlFor="ds-switch" className="text-sm">Email digest</Label>
              </div>
            </div>
          </Surface>
        </Section>

        <Section id="data" title="Data display" blurb="Scores, metrics and tables share one numeric voice: tabular figures, teal for positive, mahogany for attention.">
          <div className="grid gap-4 lg:grid-cols-3">
            <Surface level={3} className="flex items-center justify-center p-6">
              <ScoreDial score={78} label="ATS" />
            </Surface>
            <Surface level={2} className="space-y-4 p-6 lg:col-span-2">
              <MetricBar label="Skill overlap" value={82} />
              <MetricBar label="Title alignment" value={64} delay={0.05} />
              <MetricBar label="Keyword overlap" value={41} delay={0.1} />
            </Surface>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Applications" value={24} icon={Ship} index={0} />
            <StatTile label="Interviews" value={6} icon={Compass} tone="secondary" index={1} />
            <StatTile label="Offer rate" value={18} suffix="%" icon={Sparkles} tone="success" index={2} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Senior Frontend Engineer", "Harbour Labs", "86%", "Interviewing"],
                ["Product Designer", "Meridian", "72%", "Applied"],
                ["Design Engineer", "Northwind", "58%", "Saved"],
              ].map((row) => (
                <TableRow key={row[0]}>
                  <TableCell className="font-medium">{row[0]}</TableCell>
                  <TableCell>{row[1]}</TableCell>
                  <TableCell className="tabular-nums">{row[2]}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row[3]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section id="feedback" title="Badges, alerts and tooltips" blurb="Status colour is never the only signal — always pair it with a label or icon.">
          <Surface level={2} className="space-y-5 p-6">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs text-success">Strong fit</span>
              <span className="rounded-full bg-brand-secondary-soft px-2.5 py-1 text-xs text-brand-secondary">Pro</span>
            </div>
            <Alert>
              <Info className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Informational</AlertTitle>
              <AlertDescription>Scores refresh each time you upload a new resume version.</AlertDescription>
            </Alert>
            <Alert variant="danger">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Payment failed</AlertTitle>
              <AlertDescription>Update your billing details to keep Pro features active.</AlertDescription>
            </Alert>
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Notifications">
                    <Bell />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground">Icon buttons always carry an accessible name.</span>
            </div>
          </Surface>
        </Section>

        <Section id="states" title="Empty, loading and error states" blurb="Every state says what happened, why it matters, and what to do next.">
          <div className="grid gap-4 lg:grid-cols-3">
            <Surface level={2} flush className="overflow-hidden">
              <EmptyState
                title="No applications yet"
                description="Your pipeline is where momentum becomes visible — saved roles, stages and follow-ups in one view."
                hint="Save a job from Job Matching to begin."
                action={<Button size="sm">Find matches</Button>}
              />
            </Surface>
            <SkeletonPanel />
            <Surface level={2} flush className="overflow-hidden">
              <ErrorState onRetry={() => undefined} />
            </Surface>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoadingDots /> Inline loading
          </div>
        </Section>

        <Section id="motion" title="Motion" blurb="Springs come from src/lib/motion/tokens.ts and every animation honours the in-app motion setting.">
          <Surface level={2} className="space-y-2 p-6 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Entrances</span> — 12–16px rise with a soft spring, staggered 40–60ms.</p>
            <p><span className="font-medium text-foreground">State changes</span> — colour and elevation only; never move the layout under a cursor.</p>
            <p><span className="font-medium text-foreground">Numbers</span> — count up once, then stay still.</p>
            <p><span className="font-medium text-foreground">Reduced motion</span> — opacity-only fallbacks, no parallax, no shimmer.</p>
          </Surface>
        </Section>

        <Section id="spacing" title="Spacing, radius and breakpoints" blurb="A 4px base scale, three radii, and the standard Tailwind breakpoints.">
          <Surface level={2} className="grid gap-6 p-6 sm:grid-cols-3">
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-secondary">Spacing</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Card padding · 20–24px</li>
                <li>Section gap · 24px</li>
                <li>Page gutter · 16px → 24px</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-secondary">Radius</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Controls · 8px (rounded-lg)</li>
                <li>Cards · 12px (rounded-xl)</li>
                <li>Panels / modals · 16px (rounded-2xl)</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-secondary">Breakpoints</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>sm 640 · md 768</li>
                <li>lg 1024 · xl 1280</li>
                <li>Touch targets ≥ 44px</li>
              </ul>
            </div>
          </Surface>
        </Section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          Build new components from these primitives. If something here doesn&apos;t fit, extend the token layer first.
        </p>
      </div>
    </TooltipProvider>
  );
}
