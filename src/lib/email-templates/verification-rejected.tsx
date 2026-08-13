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

export interface VerificationRejectedProps {
  firstName?: string;
  programName?: string;
  reason?: string;
  acceptedDocuments?: string[];
  retryUrl?: string;
  supportUrl?: string;
}

const Email = ({
  firstName,
  programName = "Student verification",
  reason,
  acceptedDocuments = [],
  retryUrl,
  supportUrl,
}: VerificationRejectedProps) => (
  <EmailShell
    preview="We couldn't verify your documents — here's how to fix it."
    eyebrow="Verification update"
    accent="mahogany"
  >
    <Headline>We couldn&apos;t verify that yet</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we reviewed your {programName.toLowerCase()} submission and couldn&apos;t
      approve it this time. This is usually a document quality issue, and resubmitting takes a minute.
    </Paragraph>

    {reason ? (
      <Card tone="warning" title="Reason">
        <Paragraph>{reason}</Paragraph>
      </Card>
    ) : null}

    {acceptedDocuments.length > 0 ? (
      <Card tone="teal" title="Documents we accept">
        <BulletList items={acceptedDocuments} />
      </Card>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(retryUrl, "/pricing")}
      primaryLabel="Resubmit documents"
      secondaryHref={appUrl(supportUrl, "/support")}
      secondaryLabel="Contact support"
    />

    <Small>
      Make sure your name, institution and a date within the current academic year are all clearly visible.
    </Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Action needed: we couldn't verify your documents",
  displayName: "Verification rejected",
  previewData: {
    firstName: "Andrew",
    programName: "Student verification",
    reason: "The uploaded enrolment letter was cropped, so the issue date and institution name weren't readable.",
    acceptedDocuments: [
      "Current student ID with expiry date",
      "Enrolment or registration letter dated within the last 6 months",
      "Official transcript showing the current term",
    ],
  },
} satisfies TemplateEntry;
