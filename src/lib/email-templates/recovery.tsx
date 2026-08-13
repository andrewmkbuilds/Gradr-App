import * as React from "react";
import { authActionUrl, CTAButton, EmailShell, Headline, Paragraph, Small } from "./_kit";

interface RecoveryEmailProps {
  siteName?: string;
  siteUrl?: string;
  recipient?: string;
  recoveryUrl?: string;
}

export const RecoveryEmail = ({ recoveryUrl }: RecoveryEmailProps) => {
  const actionUrl = authActionUrl(recoveryUrl);
  return (
  <EmailShell preview="Reset your Gradr password — this link expires soon." eyebrow="Password reset">
    <Headline>Reset your password</Headline>
    <Paragraph>
      We received a request to reset the password on your Gradr account. Choose a new password using the
      button below.
    </Paragraph>
    <CTAButton href={actionUrl}>Choose a new password</CTAButton>
    <Small>If the button doesn&apos;t work, paste this link into your browser: {actionUrl}</Small>
    <Small>Didn&apos;t request this? Ignore this email and your password stays unchanged.</Small>
  </EmailShell>
);
}


export default RecoveryEmail;
