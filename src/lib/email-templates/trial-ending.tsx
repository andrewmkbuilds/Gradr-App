import * as React from "react";
import {
  appUrl,
  BulletList,
  Card,
  CTAGroup,
  DetailTable,
  EmailShell,
  greetName,
  Headline,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface TrialEndingProps {
  firstName?: string;
  planName?: string;
  daysLeft?: number;
  trialEndsAt?: string;
  priceLabel?: string;
  keepFeatures?: string[];
  upgradeUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  planName = "Gradr Pro",
  daysLeft = 3,
  trialEndsAt,
  priceLabel,
  keepFeatures = [],
  upgradeUrl,
  billingUrl,
}: TrialEndingProps) => (
  <EmailShell
    preview={`Your ${planName} trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}
    eyebrow="Trial ending"
    accent="mahogany"
  >
    <Headline>
      {daysLeft} day{daysLeft === 1 ? "" : "s"} left on your trial
    </Headline>
    <Paragraph>
      Hi {greetName(firstName)} — your {planName} trial wraps up soon. Keep your plan active and nothing in
      your workflow changes.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Plan", value: planName, strong: true },
        ...(trialEndsAt ? [{ label: "Trial ends", value: trialEndsAt, strong: true }] : []),
        ...(priceLabel ? [{ label: "Then", value: priceLabel }] : []),
      ]}
    />

    {keepFeatures.length > 0 ? (
      <Card tone="teal" title="What you keep on Pro">
        <BulletList items={keepFeatures} />
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(upgradeUrl, "/pricing")}
      primaryLabel="Keep my plan"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="Manage billing"
    />

    <Small>No surprises — you can cancel any time before renewal and keep access until the period ends.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Your ${data?.planName || "Gradr"} trial ends in ${data?.daysLeft ?? 3} day${
      data?.daysLeft === 1 ? "" : "s"
    }`,
  displayName: "Trial ending soon",
  previewData: {
    firstName: "Andrew",
    planName: "Gradr Pro",
    daysLeft: 3,
    trialEndsAt: "16 August 2026",
    priceLabel: "$19 / month",
    keepFeatures: [
      "Unlimited ATS resume scoring and rewrites",
      "Live AI mock interviews with scored reports",
      "Daily career briefings and job matching",
    ],
  },
} satisfies TemplateEntry;
