import * as React from "react";
import {
  appUrl,
  BulletList,
  Card,
  CTAGroup,
  EmailShell,
  greetName,
  Headline,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface WelcomeProps {
  firstName?: string;
  dashboardUrl?: string;
  onboardingUrl?: string;
}

const Email = ({ firstName, dashboardUrl, onboardingUrl }: WelcomeProps) => (
  <EmailShell preview="Your AI career command center is ready." eyebrow="Welcome to Gradr">
    <Headline>Your AI career command center is ready</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — welcome to Gradr. Everything you need to land your next role now lives in
      one place: a resume that beats ATS filters, job matches worth your time, and interview practice that
      actually builds confidence.
    </Paragraph>

    <Card tone="mahogany" title="Start here — 4 minutes">
      <BulletList
        tone="mahogany"
        items={[
          "Tell us your target role and we tailor every recommendation to it",
          "Upload your resume for an instant ATS score and keyword gap report",
          "Review your first curated job matches",
          "Run a 5-minute AI mock interview and get a scorecard",
        ]}
      />
    </Card>

    <CTAGroup
      primaryHref={appUrl(onboardingUrl, "/onboarding")}
      primaryLabel="Set up my profile"
      secondaryHref={appUrl(dashboardUrl, "/dashboard")}
      secondaryLabel="Go to dashboard"
    />

    <Small>
      Every recommendation Gradr makes is grounded in your real resume, your target role and live job data —
      never generic advice.
    </Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Welcome to Gradr — your career command center is ready",
  displayName: "Welcome / account created",
  previewData: { firstName: "Andrew" },
} satisfies TemplateEntry;
