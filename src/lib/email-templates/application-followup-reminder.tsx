import * as React from "react";
import {
  appUrl,
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

export interface FollowupReminderProps {
  firstName?: string;
  jobTitle?: string;
  companyName?: string;
  appliedAt?: string;
  daysSinceApplied?: number;
  contactName?: string;
  suggestedMessage?: string;
  applicationUrl?: string;
  preferencesUrl?: string;
}

const Email = ({
  firstName,
  jobTitle = "your application",
  companyName = "the company",
  appliedAt,
  daysSinceApplied = 7,
  contactName,
  suggestedMessage,
  applicationUrl,
  preferencesUrl,
}: FollowupReminderProps) => (
  <EmailShell
    preview={`It's been ${daysSinceApplied} days — time to follow up with ${companyName}.`}
    eyebrow="Follow-up reminder"
    accent="mahogany"
    preferencesUrl={preferencesUrl}
  >
    <Headline>Time to follow up</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — it&apos;s been {daysSinceApplied} days since you applied for{" "}
      <strong>{jobTitle}</strong> at <strong>{companyName}</strong> with no reply. A short, specific nudge is
      the single highest-return action on your list today.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Role", value: jobTitle, strong: true },
        { label: "Company", value: companyName },
        ...(appliedAt ? [{ label: "Applied", value: appliedAt }] : []),
        ...(contactName ? [{ label: "Contact", value: contactName }] : []),
      ]}
    />

    {suggestedMessage ? (
      <Card tone="teal" title="Suggested message">
        <Paragraph>{suggestedMessage}</Paragraph>
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(applicationUrl, "/applications")}
      primaryLabel="Send follow-up"
      secondaryHref={appUrl(undefined, "/applications")}
      secondaryLabel="View pipeline"
    />

    <Small>Keep it to three sentences: reaffirm interest, add one new proof point, ask about timeline.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Follow up with ${data?.companyName || "your application"} — ${data?.daysSinceApplied ?? 7} days and counting`,
  displayName: "Application follow-up reminder",
  previewData: {
    firstName: "Andrew",
    jobTitle: "Senior Product Manager",
    companyName: "Northwind Labs",
    appliedAt: "6 August 2026",
    daysSinceApplied: 7,
    contactName: "Priya Raman, Talent Lead",
    suggestedMessage:
      "Hi Priya — following up on my application for the Senior PM role. Since applying I shipped a pricing experiment that lifted conversion 12%, which maps closely to the monetisation work in your job description. Happy to share the write-up. Is there a timeline for first-round conversations?",
  },
} satisfies TemplateEntry;
