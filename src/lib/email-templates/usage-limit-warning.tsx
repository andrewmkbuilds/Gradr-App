import * as React from "react";
import {
  appUrl,
  Card,
  CTAGroup,
  EmailShell,
  greetName,
  Headline,
  Meter,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface UsageLimitWarningProps {
  firstName?: string;
  planName?: string;
  featureName?: string;
  used?: number;
  limit?: number;
  resetsAt?: string;
  upgradeUrl?: string;
  usageUrl?: string;
}

const Email = ({
  firstName,
  planName = "your plan",
  featureName = "AI credits",
  used = 0,
  limit = 100,
  resetsAt,
  upgradeUrl,
  usageUrl,
}: UsageLimitWarningProps) => {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <EmailShell
      preview={`You've used ${pct}% of your ${featureName} this cycle.`}
      eyebrow="Usage alert"
      accent="mahogany"
    >
      <Headline>You&apos;re at {pct}% of your {featureName}</Headline>
      <Paragraph>
        Hi {greetName(firstName)} — heads up: you&apos;ve used {used} of {limit} {featureName} on {planName}
        {resetsAt ? `. This allowance resets on ${resetsAt}` : ""}.
      </Paragraph>

      <Meter
        label={featureName}
        value={used}
        max={limit}
        display={`${used} / ${limit}`}
        tone={pct >= 90 ? "warning" : "mahogany"}
      />

      <Card tone="teal" title="Keep momentum">
        <Paragraph>
          Upgrading lifts the cap immediately and keeps your resume scoring, job matching and mock interviews
          running without interruption.
        </Paragraph>
      </Card>

      <CTAGroup
        primaryHref={appUrl(upgradeUrl, "/pricing")}
        primaryLabel="Upgrade plan"
        secondaryHref={appUrl(usageUrl, "/billing")}
        secondaryLabel="View usage"
      />

      <Small>You&apos;ll never be charged automatically for going over — features simply pause until reset.</Small>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `You've used most of your ${data?.featureName || "monthly credits"}`,
  displayName: "Usage limit warning",
  previewData: {
    firstName: "Andrew",
    planName: "Starter",
    featureName: "AI credits",
    used: 82,
    limit: 100,
    resetsAt: "1 September 2026",
  },
} satisfies TemplateEntry;
