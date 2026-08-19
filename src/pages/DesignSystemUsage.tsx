import { Seo } from "@/components/Seo";
import { Alert, Badge, Button, Card, CardDescription, CardTitle, Input, Text } from "@/design-system/gradr-9b9b95";

/**
 * In-app reference for the attached Gradr design system: how to import its
 * components, which tokens exist, and the rules the app follows when building
 * new surfaces. Kept behind /admin so it never ships in the product nav.
 */

const IMPORT_SNIPPET = `import { Button, Card, Input, Text, Badge, Alert } from "@/design-system/gradr-9b9b95";`;

const COMPONENTS: { name: string; props: string }[] = [
  { name: "Button", props: "variant: primary · accent · outline · ghost · destructive · link — size: sm · md · lg · icon · icon-sm · icon-lg · inline — loading" },
  { name: "Card / CardTitle / CardDescription", props: "variant: outline · raised · float — padding: none · md · lg" },
  { name: "Input / Textarea", props: "invalid" },
  { name: "FormField", props: "label, help, error, required — owns id + aria-describedby wiring" },
  { name: "Label", props: "required" },
  { name: "Text", props: "variant: h1–h6 · lead · body · body-sm · caption · overline · button · code — tone: default · muted · primary · accent · destructive — as" },
  { name: "Badge", props: "variant: neutral · primary · accent · danger · outline" },
  { name: "Alert", props: "variant: info · primary · danger — title" },
];

const TOKENS: { group: string; items: string }[] = [
  { group: "Semantic colour", items: "background, foreground, surface, surface-muted, border, muted-foreground, primary, primary-foreground, accent, accent-foreground, destructive, ring" },
  { group: "Brand palette", items: "harbor, hull, shell, fog, ink, slate, harbor-soft, hull-soft, success" },
  { group: "Typography", items: "font-display, font-sans, text-h1 … text-h6, text-body-lg, text-body, text-body-sm, text-caption, text-overline, text-button, text-code" },
  { group: "Radius", items: "rounded-card (cards, panels), rounded-control (buttons, inputs, chips)" },
  { group: "Elevation", items: "shadow-raise (resting cards), shadow-float (overlays, popovers)" },
];

const RULES = [
  "Never write raw hex, rgb or hsl values — every colour comes from a token class.",
  "Never hand-write pixel sizes for type or radii; use text-* and rounded-card / rounded-control.",
  "Express variation through variant / size props, never by overriding a component's skin with className.",
  "className on a design-system component is for placement only (width, margin, grid position).",
  "Light and dark resolve from the same tokens — the .dark class on <html> is the only switch.",
  "Never edit files under src/design-system/gradr-9b9b95/ — change src/styles/gradr-design-system.css instead.",
];

export default function DesignSystemUsage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Seo title="Design system usage" description="How to import and use the Gradr design system components and tokens." path="/admin/design-system/usage" noindex />

      <header className="space-y-2">
        <Text variant="overline" tone="accent">Design system</Text>
        <Text variant="h2" as="h1">Using Gradr components and tokens</Text>
        <Text variant="lead" tone="muted">
          The library lives in the repo at <code className="text-code">src/design-system/gradr-9b9b95/</code>. Import
          from the package root; never from a nested file path.
        </Text>
      </header>

      <Card variant="raised" padding="lg" className="space-y-4">
        <CardTitle>Import</CardTitle>
        <CardDescription>One barrel import covers every component.</CardDescription>
        <pre className="overflow-x-auto rounded-control bg-surface-muted p-4 text-code text-foreground">{IMPORT_SNIPPET}</pre>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link" size="inline">Link</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Input" aria-label="Example input" />
          <Input placeholder="Invalid input" invalid aria-label="Example invalid input" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
        <Alert variant="info" title="Alerts carry their own tone">
          Use <code className="text-code">variant="danger"</code> for blocking errors and
          {" "}<code className="text-code">variant="primary"</code> for confirmations.
        </Alert>
      </Card>

      <section className="space-y-4">
        <Text variant="h4" as="h2">Components</Text>
        <div className="grid gap-3 md:grid-cols-2">
          {COMPONENTS.map((c) => (
            <Card key={c.name} className="space-y-1">
              <CardTitle className="text-body">{c.name}</CardTitle>
              <CardDescription>{c.props}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Text variant="h4" as="h2">Tokens</Text>
        <Card variant="outline" padding="lg" className="divide-y divide-border">
          {TOKENS.map((t) => (
            <div key={t.group} className="grid gap-1 py-4 first:pt-0 last:pb-0 md:grid-cols-[10rem_1fr] md:gap-6">
              <Text variant="body-sm" className="font-medium">{t.group}</Text>
              <Text variant="body-sm" tone="muted">{t.items}</Text>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-4">
        <Text variant="h4" as="h2">House rules</Text>
        <Card variant="raised" padding="lg">
          <ul className="space-y-3">
            {RULES.map((rule) => (
              <li key={rule} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                <Text variant="body-sm" tone="muted">{rule}</Text>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
