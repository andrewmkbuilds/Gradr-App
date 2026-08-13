import * as React from "react";
import {
  appUrl,
  Badge,
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

export interface SubscriptionStartedProps {
  firstName?: string;
  planName?: string;
  billingCycle?: string;
  amount?: string;
  nextBillingDate?: string;
  features?: string[];
  dashboardUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  planName = "Pro",
  billingCycle = "Monthly",
  amount,
  nextBillingDate,
  features = [],
  dashboardUrl,
  billingUrl,
}: SubscriptionStartedProps) => (
  <EmailShell preview={`Your Gradr ${planName} plan is active.`} eyebrow="Subscription active">
    <Headline>Gradr {planName} is live</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — thank you for upgrading. Your {planName} plan is active right now, and every
      premium tool is already unlocked in your workspace. <Badge tone="success">Active</Badge>
    </Paragraph>

    <DetailTable
      accent="teal"
      rows={[
        { label: "Plan", value: `Gradr ${planName}`, strong: true },
        { label: "Billing cycle", value: billingCycle },
        ...(amount ? [{ label: "Amount", value: amount }] : []),
        ...(nextBillingDate ? [{ label: "Next billing date", value: nextBillingDate }] : []),
      ]}
    />

    {features.length > 0 ? (
      <Card tone="mahogany" title="Now unlocked">
        <BulletList tone="mahogany" items={features} />
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(dashboardUrl, "/dashboard")}
      primaryLabel="Open Gradr"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="Manage billing"
    />

    <Small>You can change or cancel your plan at any time from your billing settings.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `Your Gradr ${data?.planName || "Pro"} plan is active`,
  displayName: "Subscription started",
  previewData: {
    firstName: "Andrew",
    planName: "Pro",
    billingCycle: "Monthly",
    amount: "$19.00 / month",
    nextBillingDate: "13 September 2026",
    features: ["Unlimited resume analyses", "Unlimited AI mock interviews", "Priority job matching"],
  },
} satisfies TemplateEntry;
