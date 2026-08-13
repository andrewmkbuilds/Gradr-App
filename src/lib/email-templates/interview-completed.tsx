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

export interface InterviewCompletedProps {
  firstName?: string;
  interviewType?: string;
  roleTitle?: string;
  durationLabel?: string;
  questionsAnswered?: number;
  completedAt?: string;
  reportEtaLabel?: string;
  interviewUrl?: string;
  practiceUrl?: string;
}

const Email = ({
  firstName,
  interviewType = "Mock interview",
  roleTitle,
  durationLabel,
  questionsAnswered,
  completedAt,
  reportEtaLabel = "in a few minutes",
  interviewUrl,
  practiceUrl,
}: InterviewCompletedProps) => (
  <EmailShell preview="Nice work — your interview session is complete." eyebrow="Interview complete">
    <Headline>Session complete — nice work</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — you finished your {interviewType.toLowerCase()}
      {roleTitle ? ` for ${roleTitle}` : ""}. We&apos;re scoring your answers now and your full report lands{" "}
      {reportEtaLabel}.
    </Paragraph>

    <DetailTable
      accent="teal"
      rows={[
        { label: "Session", value: interviewType, strong: true },
        ...(roleTitle ? [{ label: "Target role", value: roleTitle }] : []),
        ...(durationLabel ? [{ label: "Duration", value: durationLabel }] : []),
        ...(typeof questionsAnswered === "number"
          ? [{ label: "Questions answered", value: String(questionsAnswered) }]
          : []),
        ...(completedAt ? [{ label: "Completed", value: completedAt }] : []),
      ]}
    />

    <Card tone="mahogany" title="While you wait">
      <Paragraph>
        Jot down the one question that felt hardest. Reviewing it against your report tomorrow is the single
        fastest way to turn a weak answer into a rehearsed one.
      </Paragraph>
    </Card>

    <CTAGroup
      primaryHref={appUrl(interviewUrl, "/interview")}
      primaryLabel="View session"
      secondaryHref={appUrl(practiceUrl, "/interview")}
      secondaryLabel="Practice again"
    />

    <Small>Consistency beats intensity — two short sessions a week outperforms one long one.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Your Gradr interview session is complete",
  displayName: "Interview completed",
  previewData: {
    firstName: "Andrew",
    interviewType: "Behavioural mock interview",
    roleTitle: "Senior Product Manager",
    durationLabel: "18 minutes",
    questionsAnswered: 8,
  },
} satisfies TemplateEntry;
