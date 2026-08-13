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

export interface InterviewScheduledProps {
  firstName?: string;
  jobTitle?: string;
  companyName?: string;
  interviewAt?: string;
  timezone?: string;
  format?: string;
  interviewers?: string;
  prepChecklist?: string[];
  prepUrl?: string;
  applicationUrl?: string;
}

const Email = ({
  firstName,
  jobTitle = "your interview",
  companyName = "the company",
  interviewAt,
  timezone,
  format,
  interviewers,
  prepChecklist = [],
  prepUrl,
  applicationUrl,
}: InterviewScheduledProps) => (
  <EmailShell
    preview={`Interview locked in with ${companyName}${interviewAt ? ` on ${interviewAt}` : ""}.`}
    eyebrow="Interview scheduled"
  >
    <Headline>Interview locked in</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — your interview for <strong>{jobTitle}</strong> at{" "}
      <strong>{companyName}</strong> is on the calendar. Here are the details and a prep plan you can finish
      in one sitting.
    </Paragraph>

    <DetailTable
      accent="teal"
      rows={[
        { label: "Role", value: jobTitle, strong: true },
        { label: "Company", value: companyName },
        ...(interviewAt ? [{ label: "When", value: `${interviewAt}${timezone ? ` (${timezone})` : ""}`, strong: true }] : []),
        ...(format ? [{ label: "Format", value: format }] : []),
        ...(interviewers ? [{ label: "Interviewers", value: interviewers }] : []),
      ]}
    />

    {prepChecklist.length > 0 ? (
      <Card tone="mahogany" title="Your prep checklist">
        <BulletList tone="mahogany" items={prepChecklist} />
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(prepUrl, "/interview")}
      primaryLabel="Start prep session"
      secondaryHref={appUrl(applicationUrl, "/applications")}
      secondaryLabel="View application"
    />

    <Small>We&apos;ll send a short reminder with your prep notes the day before.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Interview scheduled: ${data?.jobTitle || "your role"} at ${data?.companyName || "your target company"}`,
  displayName: "Interview scheduled",
  previewData: {
    firstName: "Andrew",
    jobTitle: "Senior Product Manager",
    companyName: "Northwind Labs",
    interviewAt: "Tuesday, 19 August · 3:00 PM",
    timezone: "GST",
    format: "45-minute video call",
    interviewers: "Priya Raman (Talent), Marc Ellis (Head of Product)",
    prepChecklist: [
      "Run one behavioural mock tuned to this role",
      "Prepare two metrics-backed stories on shipping under constraint",
      "Draft three questions about their roadmap and success measures",
    ],
  },
} satisfies TemplateEntry;
