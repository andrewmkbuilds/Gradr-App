import * as React from "react";
import { Text } from "@react-email/components";
import { appUrl, Card, CTAButton, EmailShell, greetName, Headline, palette, Paragraph, Small } from "./_kit";
import type { TemplateEntry } from "./registry";

export interface VerificationProps {
  firstName?: string;
  email?: string;
  verifyUrl?: string;
  expiresInMinutes?: number;
}

const Email = ({ firstName, email, verifyUrl, expiresInMinutes = 60 }: VerificationProps) => (
  <EmailShell preview="Confirm your email address to activate your Gradr account." eyebrow="Verify your email">
    <Headline>Confirm your email address</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — one quick step and your Gradr account is live. Confirm{" "}
      {email ? <strong style={{ color: palette.ink }}>{email}</strong> : "your email address"} so we can secure
      your account and send you match alerts and interview reports.
    </Paragraph>

    <CTAButton href={appUrl(verifyUrl, "/auth")}>Verify my email</CTAButton>

    <Card tone="neutral" title="Good to know">
      <Text style={{ margin: 0, fontSize: "13px", lineHeight: "21px", color: palette.body }}>
        This link expires in {expiresInMinutes} minutes and can only be used once. If you didn&apos;t create a
        Gradr account, you can safely ignore this email — nothing will be activated.
      </Text>
    </Card>

    <Small>Trouble with the button? Copy this link into your browser: {appUrl(verifyUrl, "/auth")}</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Confirm your email to activate Gradr",
  displayName: "Email verification",
  previewData: { firstName: "Andrew", email: "andrew@example.com" },
} satisfies TemplateEntry;
