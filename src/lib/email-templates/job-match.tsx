import * as React from "react";
import { Section, Text } from "@react-email/components";
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
  palette,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface JobMatchProps {
  firstName?: string;
  jobTitle?: string;
  companyName?: string;
  location?: string;
  salaryRange?: string;
  postedAt?: string;
  matchScore?: number;
  whyItMatches?: string;
  keySkills?: string[];
  missingSkills?: string[];
  jobUrl?: string;
  applyUrl?: string;
  moreMatchesCount?: number;
}

const Email = ({
  firstName,
  jobTitle = "New role",
  companyName = "A hiring company",
  location,
  salaryRange,
  postedAt,
  matchScore = 0,
  whyItMatches,
  keySkills = [],
  missingSkills = [],
  jobUrl,
  applyUrl,
  moreMatchesCount = 0,
}: JobMatchProps) => (
  <EmailShell
    preview={`${matchScore}% match — ${jobTitle} at ${companyName}.`}
    eyebrow="New job match"
  >
    <Headline>{jobTitle}</Headline>
    <Text
      style={{
        margin: "0 0 16px",
        fontSize: "15px",
        color: palette.mahogany,
        fontWeight: 700,
        letterSpacing: "0.01em",
      }}
    >
      {companyName}
      {location ? ` · ${location}` : ""}
    </Text>

    <Paragraph>
      Hi {greetName(firstName)} — this one scored high against your profile and target role, so it&apos;s worth
      your attention today.
    </Paragraph>

    <Meter label="Match score" value={matchScore} display={`${matchScore}%`} tone={matchScore >= 80 ? "success" : "teal"} />

    <Section style={{ margin: "0 0 18px" }}>
      {salaryRange ? <Badge tone="mahogany">{salaryRange}</Badge> : null}{" "}
      {postedAt ? <Badge tone="neutral">Posted {postedAt}</Badge> : null}
    </Section>

    {whyItMatches ? (
      <Card tone="teal" title="Why it matches you">
        <Paragraph>{whyItMatches}</Paragraph>
      </Card>
    ) : null}

    {keySkills.length > 0 ? (
      <Card tone="success" title="Your matching skills">
        <BulletList tone="success" items={keySkills} />
      </Card>
    ) : null}

    {missingSkills.length > 0 ? (
      <Card tone="mahogany" title="Gaps to address in your application">
        <BulletList tone="mahogany" items={missingSkills} />
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(applyUrl, "/apply")}
      primaryLabel="Tailor & apply"
      secondaryHref={appUrl(jobUrl, "/match")}
      secondaryLabel="View job details"
    />

    {moreMatchesCount > 0 ? (
      <Small>
        {moreMatchesCount} more match{moreMatchesCount === 1 ? "" : "es"} are waiting in your dashboard.
      </Small>
    ) : null}
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data?.matchScore ? `${data.matchScore}% match: ` : "New match: "}${data?.jobTitle || "A new role"} at ${
      data?.companyName || "a company hiring now"
    }`,
  displayName: "Job match notification",
  previewData: {
    firstName: "Andrew",
    jobTitle: "Senior Product Manager",
    companyName: "Northwind Labs",
    location: "Dubai (Hybrid)",
    salaryRange: "$120k – $150k",
    postedAt: "2 days ago",
    matchScore: 88,
    whyItMatches:
      "Your last two roles map almost exactly to this scope: B2B SaaS, 0→1 product ownership and a data-heavy roadmap. Their requirement for analytics fluency matches your strongest resume signal.",
    keySkills: ["Roadmap prioritisation", "B2B SaaS", "SQL & product analytics", "Stakeholder management"],
    missingSkills: ["Marketplace pricing experience — address it directly in your cover letter"],
    moreMatchesCount: 6,
  },
} satisfies TemplateEntry;
