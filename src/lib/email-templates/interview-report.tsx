import * as React from "react";
import {
  appUrl,
  BulletList,
  Card,
  CTAGroup,
  EmailShell,
  greetName,
  Headline,
  Meter,
  Paragraph,
  ScoreBlock,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface InterviewReportProps {
  firstName?: string;
  roleTitle?: string;
  overallScore?: number;
  communicationScore?: number;
  confidenceScore?: number;
  technicalScore?: number;
  structureScore?: number;
  strengths?: string[];
  areasToImprove?: string[];
  standoutMoment?: string;
  reportUrl?: string;
  practiceUrl?: string;
}

const tone = (score: number) => (score >= 80 ? "success" : score >= 60 ? "teal" : "warning");

const Email = ({
  firstName,
  roleTitle,
  overallScore = 0,
  communicationScore,
  confidenceScore,
  technicalScore,
  structureScore,
  strengths = [],
  areasToImprove = [],
  standoutMoment,
  reportUrl,
  practiceUrl,
}: InterviewReportProps) => (
  <EmailShell
    preview={`Your interview report is ready — overall score ${overallScore}/100.`}
    eyebrow="Interview report"
  >
    <Headline>Your interview scorecard</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we scored every answer from your{roleTitle ? ` ${roleTitle}` : ""} session
      across delivery, structure and substance. Here&apos;s the summary.
    </Paragraph>

    <ScoreBlock
      value={overallScore}
      suffix="/100"
      label="Overall performance"
      tone={tone(overallScore)}
      caption={
        overallScore >= 80
          ? "Interview-ready. Keep sharpening the details below."
          : overallScore >= 60
            ? "Competent and improving — the gaps below are the ones costing you offers."
            : "Early days. Focus on one dimension at a time, starting with structure."
      }
    />

    {typeof communicationScore === "number" ? (
      <Meter label="Communication" value={communicationScore} display={`${communicationScore}/100`} tone={tone(communicationScore)} />
    ) : null}
    {typeof confidenceScore === "number" ? (
      <Meter label="Confidence" value={confidenceScore} display={`${confidenceScore}/100`} tone={tone(confidenceScore)} />
    ) : null}
    {typeof technicalScore === "number" ? (
      <Meter label="Technical performance" value={technicalScore} display={`${technicalScore}/100`} tone={tone(technicalScore)} />
    ) : null}
    {typeof structureScore === "number" ? (
      <Meter label="Answer structure" value={structureScore} display={`${structureScore}/100`} tone={tone(structureScore)} />
    ) : null}

    {strengths.length > 0 ? (
      <Card tone="success" title="What you did well">
        <BulletList tone="success" items={strengths} />
      </Card>
    ) : null}

    {areasToImprove.length > 0 ? (
      <Card tone="mahogany" title="Areas to improve">
        <BulletList tone="mahogany" items={areasToImprove} />
      </Card>
    ) : null}

    {standoutMoment ? (
      <Card tone="teal" title="Standout moment">
        <Paragraph>{standoutMoment}</Paragraph>
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(reportUrl, "/interview")}
      primaryLabel="View full report"
      secondaryHref={appUrl(practiceUrl, "/interview")}
      secondaryLabel="Run another session"
    />

    <Small>Your full report includes per-question transcripts, model answers and delivery analytics.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Your interview report is ready — ${data?.overallScore ?? "scored"}${
      typeof data?.overallScore === "number" ? "/100" : ""
    }`,
  displayName: "Interview report ready",
  previewData: {
    firstName: "Andrew",
    roleTitle: "Senior Product Manager",
    overallScore: 81,
    communicationScore: 86,
    confidenceScore: 72,
    technicalScore: 84,
    structureScore: 79,
    strengths: [
      "Consistent STAR structure across behavioural answers",
      "Concrete metrics in every impact story",
    ],
    areasToImprove: [
      "Reduce filler words in the first 20 seconds of each answer",
      "Close answers with the outcome instead of trailing off",
    ],
    standoutMoment:
      "Your answer on de-scoping a launch under deadline pressure was the strongest of the session — reuse that story.",
  },
} satisfies TemplateEntry;
