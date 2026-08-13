import * as React from "react";
import { Text } from "@react-email/components";
import { appUrl, Card, CTAButton, EmailShell, greetName, Headline, palette, Paragraph, Small } from "./_kit";
import type { TemplateEntry } from "./registry";

export interface PasswordResetProps {
  firstName?: string;
  resetUrl?: string;
  expiresInMinutes?: number;
  requestedFrom?: string;
}

const Email = ({ firstName, resetUrl, expiresInMinutes = 60, requestedFrom }: PasswordResetProps) => (
  <EmailShell preview="Reset your Gradr password — this link expires soon." eyebrow="Password reset">
    <Headline>Reset your password</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we received a request to reset the password on your Gradr account. Choose a
      new password using the button below.
    </Paragraph>

    <CTAButton href={appUrl(resetUrl, "/reset-password")}>Choose a new password</CTAButton>

    <Card tone="warning" title="Didn't request this?">
      <Text style={{ margin: 0, fontSize: "13px", lineHeight: "21px", color: palette.body }}>
        Ignore this email and your password stays unchanged. The link expires in {expiresInMinutes} minutes and
        works only once.
        {requestedFrom ? ` Request origin: ${requestedFrom}.` : ""}
      </Text>
    </Card>

    <Small>If the button doesn&apos;t work, paste this link into your browser: {appUrl(resetUrl, "/reset-password")}</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Reset your Gradr password",
  displayName: "Password reset",
  previewData: { firstName: "Andrew" },
} satisfies TemplateEntry;
