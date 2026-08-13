import * as React from "react";
import { authActionUrl, CTAButton, EmailShell, Headline, Paragraph, Small } from "./_kit";

interface MagicLinkEmailProps {
  siteName?: string;
  siteUrl?: string;
  recipient?: string;
  magicLinkUrl?: string;
}

export const MagicLinkEmail = ({ magicLinkUrl }: MagicLinkEmailProps) => {
  const actionUrl = authActionUrl(magicLinkUrl);
  return (
  <EmailShell preview="Your secure sign-in link for Gradr." eyebrow="Sign in">
    <Headline>Your sign-in link</Headline>
    <Paragraph>
      Use the button below to sign in to Gradr. For your security this link works once and expires shortly.
    </Paragraph>
    <CTAButton href={actionUrl}>Sign in to Gradr</CTAButton>
    <Small>If the button doesn&apos;t work, paste this link into your browser: {actionUrl}</Small>
    <Small>Didn&apos;t request this? You can safely ignore this email.</Small>
  </EmailShell>
);
}


export default MagicLinkEmail;
