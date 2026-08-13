import * as React from "react";
import {
  appUrl,
  Badge,
  BulletList,
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

export interface AtsScoreUpdateProps {
  firstName?: string;
  resumeName?: string;
  previousScore?: number;
  newScore?: number;
  fixesApplied?: string[];
  remainingIssues?: string[];
  resumeUrl?: string;
  matchUrl?: string;
}

const Email = ({
  firstName,
  resumeName = "Your resume",
  previousScore = 0,
  newScore = 0,
  fixesApplied = [],
  remainingIssues = [],
  resumeUrl,
  matchUrl,
}: AtsScoreUpdateProps) => {
  const delta = newScore - previousScore;
  const improved = delta >= 0;
  return (
    <EmailShell
      preview={`Your ATS score moved from ${previousScore} to ${newScore}.`}
      eyebrow="ATS score update"
      accent="mahogany"
    >
      <Headline>
        {previousScore} → {newScore}
      </Headline>
      <Paragraph>
        Hi {greetName(firstName)} — <strong>{resumeName}</strong> was re-scored after your latest edits.{" "}
        <Badge tone={improved ? "success" : "warning"}>
          {improved ? `+${delta} points` : `${delta} points`}
        </Badge>
      </Paragraph>

      <Meter label="ATS score" value={newScore} display={`${newScore}/100`} tone={newScore >= 80 ? "success" : "teal"} />
      <Meter label="Previous score" value={previousScore} display={`${previousScore}/100`} tone="neutral" />

      {fixesApplied.length > 0 ? (
        <Card tone="success" title="What improved">
          <BulletList tone="success" items={fixesApplied} />
        </Card>
      ) : null}

      {remainingIssues.length > 0 ? (
        <Card tone="mahogany" title="Still worth fixing">
          <BulletList tone="mahogany" items={remainingIssues} />
        </Card>
      ) : null}

      <CTAGroup
        primaryHref={appUrl(resumeUrl, "/resume")}
        primaryLabel="Open resume editor"
        secondaryHref={appUrl(matchUrl, "/match")}
        secondaryLabel="Find matching jobs"
      />

      <Small>Scores above 80 clear the vast majority of applicant tracking filters for your target role.</Small>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `ATS score update: ${data?.newScore ?? "your resume"}/100`,
  displayName: "ATS score update",
  previewData: {
    firstName: "Andrew",
    resumeName: "Andrew_Mathews_2026.pdf",
    previousScore: 64,
    newScore: 82,
    fixesApplied: ["Added 7 missing role keywords", "Replaced 4 passive bullets with quantified impact"],
    remainingIssues: ["Summary is still 3 lines longer than recommended"],
  },
} satisfies TemplateEntry;
