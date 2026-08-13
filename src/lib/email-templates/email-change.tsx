import * as React from "react";
import { authActionUrl, CTAButton, EmailShell, Headline, Paragraph, Small } from "./_kit";

interface EmailChangeEmailProps {
  siteName?: string;
  siteUrl?: string;
  recipient?: string;
  newEmail?: string;
  confirmationUrl?: string;
}

export const EmailChangeEmail = ({ newEmail, confirmationUrl }: EmailChangeEmailProps) => {
  const actionUrl = authActionUrl(confirmationUrl);
  return (
  <EmailShell preview="Confirm your new email address for Gradr." eyebrow="Email change">
    <Headline>Confirm your new email</Headline>
    <Paragraph>
      Confirm {newEmail ? newEmail : "your new email address"} to finish updating the email on your Gradr
      account.
    </Paragraph>
    <CTAButton href={actionUrl}>Confirm new email</CTAButton>
    <Small>If the button doesn&apos;t work, paste this link into your browser: {actionUrl}</Small>
    <Small>Didn&apos;t request this change? Contact support right away.</Small>
  </EmailShell>
);
}


export default EmailChangeEmail;
