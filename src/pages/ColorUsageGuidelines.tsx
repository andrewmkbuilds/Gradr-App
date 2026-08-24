import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Rule = { area: string; teal: string; mahogany: string };

const RULES: Rule[] = [
  {
    area: "CTAs",
    teal: "Every primary action: Save, Continue, Start interview, Analyze resume.",
    mahogany: "At most one strategic conversion CTA per surface (Upgrade, Go Pro).",
  },
  {
    area: "Badges",
    teal: "Status, counts, filters, metadata chips (`default`, `soft`).",
    mahogany: "Merchandising and rarity: Popular, New, Pro, Recommended (`accent`, `accentSoft`).",
  },
  {
    area: "Highlights",
    teal: "Active nav, selected rows, focus rings, progress fills.",
    mahogany: "The single 'look here' moment in a view: a callout card, a hero underline.",
  },
  {
    area: "Dividers",
    teal: "Never tinted — dividers use neutral `--border` by default.",
    mahogany: "Only the `accent` separator to close a narrative section on marketing pages.",
  },
  {
    area: "Charts",
    teal: "Series 1 and the primary metric line/area — teal always leads.",
    mahogany: "Series 2 or the comparison/benchmark series, plus target markers.",
  },
];

const DOS = [
  "Teal is the product. Mahogany is punctuation — roughly 10% of coloured surface.",
  "One mahogany element per viewport. If two compete, demote one to teal.",
  "Use the semantic tokens (`bg-primary`, `bg-mahogany-soft`), never hex values.",
  "Charts start at `--chart-1` (teal) and only reach mahogany at `--chart-2`.",
];

const DONTS = [
  "Don't use mahogany for destructive intent — that's `destructive`.",
  "Don't tint structural dividers, borders, or table rules with mahogany.",
  "Don't pair a mahogany CTA next to a teal CTA of the same weight.",
  "Don't introduce new accent hues; the palette is locked to Yacht Club.",
];

export default function ColorUsageGuidelines() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <PageHeader
        title="Mahogany vs Teal"
        description="When to reach for Ocean Teal and when to spend Mahogany. Component primitives follow these rules by default."
      />

      <Card>
        <CardHeader>
          <CardTitle>The one-line rule</CardTitle>
          <CardDescription>
            Ocean Teal carries the product. Mahogany is emphasis you spend, not a second brand colour.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>Teal primary action</Button>
          <Button variant="accent">Mahogany, once per surface</Button>
          <Badge>Status</Badge>
          <Badge variant="soft">Metadata</Badge>
          <Badge variant="accent">Popular</Badge>
          <Badge variant="accentSoft">New</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By surface</CardTitle>
          <CardDescription>Apply per element, not per page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {RULES.map((rule, i) => (
            <div key={rule.area}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr] sm:gap-4">
                <p className="font-display text-sm text-foreground">{rule.area}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-primary">Teal · </span>
                  {rule.teal}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-mahogany-strong">Mahogany · </span>
                  {rule.mahogany}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator variant="accent" />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Do</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {DOS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="accent-dot mt-2 shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Don&apos;t</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {DONTS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
