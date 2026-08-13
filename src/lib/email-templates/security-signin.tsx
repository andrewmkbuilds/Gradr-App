import * as React from "react";
import { appUrl, CTAGroup, DetailTable, EmailShell, greetName, Headline, Paragraph, Small } from "./_kit";
import type { TemplateEntry } from "./registry";

export interface SecuritySignInProps {
  firstName?: string;
  device?: string;
  browser?: string;
  location?: string;
  ipAddress?: string;
  signedInAt?: string;
  securityUrl?: string;
  resetUrl?: string;
}

const Email = ({
  firstName,
  device = "Unknown device",
  browser = "Unknown browser",
  location = "Unknown location",
  ipAddress,
  signedInAt,
  securityUrl,
  resetUrl,
}: SecuritySignInProps) => (
  <EmailShell
    preview="A new sign-in to your Gradr account was detected."
    eyebrow="Security notification"
    accent="mahogany"
  >
    <Headline>New sign-in to your account</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — your Gradr account was just accessed from a new session. If this was you,
      nothing else is needed.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "When", value: signedInAt || new Date().toUTCString() },
        { label: "Device", value: device },
        { label: "Browser", value: browser },
        { label: "Location", value: location },
        ...(ipAddress ? [{ label: "IP address", value: ipAddress }] : []),
      ]}
    />

    <Paragraph>
      Don&apos;t recognise this activity? Secure your account immediately by resetting your password and
      reviewing active sessions.
    </Paragraph>

    <CTAGroup
      primaryHref={appUrl(resetUrl, "/forgot-password")}
      primaryLabel="Secure my account"
      secondaryHref={appUrl(securityUrl, "/settings")}
      secondaryLabel="Review sessions"
    />

    <Small>Gradr will never ask you for your password, verification codes or payment details over email.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "New sign-in to your Gradr account",
  displayName: "Sign-in / security notification",
  previewData: {
    firstName: "Andrew",
    device: "MacBook Pro",
    browser: "Chrome 128",
    location: "Dubai, UAE",
  },
} satisfies TemplateEntry;
