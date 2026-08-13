import * as React from "react";
import {
  appUrl,
  Badge,
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

export interface ApplicationStatusProps {
  firstName?: string;
  jobTitle?: string;
  companyName?: string;
  previousStatus?: string;
  newStatus?: string;
  changedAt?: string;
  nextStep?: string;
  applicationUrl?: string;
  interviewUrl?: string;
}

const statusTone = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes("offer") || s.includes("interview") || s.includes("accepted")) return "success" as const;
  if (s.includes("reject") || s.includes("closed") || s.includes("declined")) return "danger" as const;
  return "teal" as const;
};

const Email = ({
  firstName,
  jobTitle = "your application",
  companyName = "the company",
  previousStatus,
  newStatus = "Updated",
  changedAt,
  nextStep,
  applicationUrl,
  interviewUrl,
}: ApplicationStatusProps) => (
  <EmailShell
    preview={`${jobTitle} at ${companyName} moved to ${newStatus}.`}
    eyebrow="Application update"
    accent="mahogany"
  >
    <Headline>{newStatus}</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — your application for <strong>{jobTitle}</strong> at{" "}
      <strong>{companyName}</strong> just changed status.{" "}
      <Badge tone={statusTone(newStatus)}>{newStatus}</Badge>
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Role", value: jobTitle, strong: true },
        { label: "Company", value: companyName },
        ...(previousStatus ? [{ label: "Previous status", value: previousStatus }] : []),
        { label: "New status", value: newStatus, strong: true },
        ...(changedAt ? [{ label: "Updated", value: changedAt }] : []),
      ]}
    />

    {nextStep ? (
      <Card tone="mahogany" title="Recommended next step">
        <Paragraph>{nextStep}</Paragraph>
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(applicationUrl, "/applications")}
      primaryLabel="Open application"
      secondaryHref={appUrl(interviewUrl, "/interview")}
      secondaryLabel="Prep an interview"
    />

    <Small>Keeping statuses current is what powers your readiness score and daily briefing.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data?.jobTitle || "Application"} at ${data?.companyName || "your target company"} — ${
      data?.newStatus || "status updated"
    }`,
  displayName: "Application status update",
  previewData: {
    firstName: "Andrew",
    jobTitle: "Senior Product Manager",
    companyName: "Northwind Labs",
    previousStatus: "Applied",
    newStatus: "Interview scheduled",
    changedAt: "Today, 09:14",
    nextStep:
      "Run a 15-minute behavioural mock tuned to this role — candidates who practice within 48 hours of scheduling score materially higher.",
  },
} satisfies TemplateEntry;
