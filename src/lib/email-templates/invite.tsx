import * as React from "react";
import { CTAButton, EmailShell, Headline, Paragraph, Small } from "./_kit";

interface InviteEmailProps {
  siteName?: string;
  siteUrl?: string;
  recipient?: string;
  inviteUrl?: string;
}

export const InviteEmail = ({ inviteUrl }: InviteEmailProps) => (
  <EmailShell preview="You've been invited to join Gradr." eyebrow="Invitation">
    <Headline>You&apos;ve been invited to Gradr</Headline>
    <Paragraph>
      Accept your invitation to join Gradr, the AI career copilot for resumes, job matching, and interview
      practice.
    </Paragraph>
    <CTAButton href={inviteUrl}>Accept invitation</CTAButton>
    <Small>If the button doesn&apos;t work, paste this link into your browser: {inviteUrl}</Small>
  </EmailShell>
);

export default InviteEmail;
