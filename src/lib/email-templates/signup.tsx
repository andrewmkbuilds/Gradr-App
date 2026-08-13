import * as React from "react";
import { authActionUrl, CTAButton, EmailShell, Headline, Paragraph, Small } from "./_kit";

interface SignupEmailProps {
  siteName?: string;
  siteUrl?: string;
  recipient?: string;
  confirmationUrl?: string;
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => {
  const actionUrl = authActionUrl(confirmationUrl);
  return (
  <EmailShell preview="Confirm your email to activate your Gradr account." eyebrow="Confirm your email">
    <Headline>Confirm your email</Headline>
    <Paragraph>
      Welcome to Gradr — your AI career copilot. Confirm {recipient ? recipient : "your email address"} to
      activate your account and start building ATS-ready resumes, matching to jobs, and practising interviews.
    </Paragraph>
    <CTAButton href={actionUrl}>Verify email</CTAButton>
    <Small>
      If the button doesn&apos;t work, paste this link into your browser: {actionUrl}
    </Small>
    <Small>If you didn&apos;t create a Gradr account, you can safely ignore this email.</Small>
  </EmailShell>
);
}


export default SignupEmail;
