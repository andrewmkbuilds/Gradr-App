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

export interface SubscriptionUpgradedProps {
  firstName?: string;
  previousPlan?: string;
  planName?: string;
  billingCycle?: string;
  amount?: string;
  effectiveDate?: string;
  proratedCredit?: string;
  newFeatures?: string[];
  dashboardUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  previousPlan = "Starter",
  planName = "Pro",
  billingCycle = "Monthly",
  amount,
  effectiveDate,
  proratedCredit,
  newFeatures = [],
  dashboardUrl,
  billingUrl,
}: SubscriptionUpgradedProps) => (
  <EmailShell preview={`You're now on Gradr ${planName}.`} eyebrow="Plan upgraded">
    <Headline>
      {previousPlan} → {planName}
    </Headline>
    <Paragraph>
      Hi {greetName(firstName)} — your upgrade went through. Everything on {planName} is available immediately,
      and your existing work carries over untouched.
    </Paragraph>

    <DetailTable
      accent="teal"
      rows={[
        { label: "Previous plan", value: previousPlan },
        { label: "New plan", value: `Gradr ${planName}`, strong: true },
        { label: "Billing cycle", value: billingCycle },
        ...(amount ? [{ label: "New amount", value: amount }] : []),
        ...(proratedCredit ? [{ label: "Prorated credit applied", value: proratedCredit }] : []),
        ...(effectiveDate ? [{ label: "Effective", value: effectiveDate }] : []),
      ]}
    />

    {newFeatures.length > 0 ? (
      <Card tone="mahogany" title="What's new for you">
        <BulletList tone="mahogany" items={newFeatures} />
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(dashboardUrl, "/dashboard")}
      primaryLabel="Use my new tools"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="View billing"
    />

    <Small>Any unused portion of your previous plan is automatically credited against this invoice.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `You've been upgraded to Gradr ${data?.planName || "Pro"}`,
  displayName: "Subscription upgraded",
  previewData: {
    firstName: "Andrew",
    previousPlan: "Starter",
    planName: "Pro",
    amount: "$19.00 / month",
    newFeatures: ["Unlimited mock interviews", "Advanced ATS rewriting", "Priority support"],
  },
} satisfies TemplateEntry;
