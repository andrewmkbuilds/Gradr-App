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

export interface ResumeAnalysisProps {
  firstName?: string;
  resumeName?: string;
  targetRole?: string;
  atsScore?: number;
  matchScore?: number;
  keywordCoverage?: number;
  strengths?: string[];
  topImprovement?: string;
  analysisUrl?: string;
  resumeUrl?: string;
}

const scoreTone = (score: number) => (score >= 80 ? "success" : score >= 60 ? "teal" : "warning");

const Email = ({
  firstName,
  resumeName = "Your resume",
  targetRole,
  atsScore = 0,
  matchScore,
  keywordCoverage,
  strengths = [],
  topImprovement,
  analysisUrl,
  resumeUrl,
}: ResumeAnalysisProps) => (
  <EmailShell
    preview={`Your resume analysis is ready — ATS score ${atsScore}/100.`}
    eyebrow="Resume intelligence"
  >
    <Headline>Your resume analysis is ready</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we finished scanning <strong>{resumeName}</strong>
      {targetRole ? ` against ${targetRole} roles` : ""}. Here&apos;s where you stand.
    </Paragraph>

    <ScoreBlock
      value={atsScore}
      suffix="/100"
      label="ATS score"
      tone={scoreTone(atsScore)}
      caption={
        atsScore >= 80
          ? "Strong — this resume parses cleanly through applicant tracking systems."
          : atsScore >= 60
            ? "Solid foundation with clear, fixable gaps."
            : "Needs work before you apply — the fixes below move the needle fastest."
      }
    />

    {typeof matchScore === "number" ? (
      <Meter label="Role match" value={matchScore} display={`${matchScore}%`} tone="mahogany" />
    ) : null}
    {typeof keywordCoverage === "number" ? (
      <Meter label="Keyword coverage" value={keywordCoverage} display={`${keywordCoverage}%`} tone="teal" />
    ) : null}

    {strengths.length > 0 ? (
      <Card tone="success" title="Key strengths">
        <BulletList tone="success" items={strengths} />
      </Card>
    ) : null}

    {topImprovement ? (
      <Card tone="mahogany" title="Top improvement">
        <Paragraph>{topImprovement}</Paragraph>
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(analysisUrl, "/resume")}
      primaryLabel="View full analysis"
      secondaryHref={appUrl(resumeUrl, "/resume")}
      secondaryLabel="Improve my resume"
    />

    <Small>Every score is calculated against live job descriptions for your target role, not a generic rubric.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Your resume analysis is ready — ATS ${data?.atsScore ?? "score"}${typeof data?.atsScore === "number" ? "/100" : ""}`,
  displayName: "Resume analysis completed",
  previewData: {
    firstName: "Andrew",
    resumeName: "Andrew_Mathews_2026.pdf",
    targetRole: "Product Manager",
    atsScore: 78,
    matchScore: 72,
    keywordCoverage: 64,
    strengths: [
      "Quantified impact in 6 of 9 bullet points",
      "Clean single-column layout that parses reliably",
      "Strong leadership signal in recent roles",
    ],
    topImprovement:
      "Add the phrase “roadmap prioritisation” and two product analytics tools — they appear in 71% of the job descriptions you're targeting but nowhere in your resume.",
  },
} satisfies TemplateEntry;
