import * as React from "react";
import { Text } from "@react-email/components";
import { Card, EmailShell, Headline, palette, Paragraph, Small } from "./_kit";

interface ReauthenticationEmailProps {
  siteName?: string;
  siteUrl?: string;
  recipient?: string;
  token?: string;
}

export const ReauthenticationEmail = ({ token = "------" }: ReauthenticationEmailProps) => (
  <EmailShell preview="Your Gradr verification code." eyebrow="Verification code">
    <Headline>Your verification code</Headline>
    <Paragraph>Enter this code in Gradr to confirm it&apos;s really you.</Paragraph>
    <Card tone="teal" title="Verification code">
      <Text
        style={{
          margin: 0,
          fontSize: "28px",
          letterSpacing: "0.28em",
          fontWeight: 700,
          color: palette.teal,
        }}
      >
        {token}
      </Text>
    </Card>
    <Small>The code expires shortly. If you didn&apos;t request it, you can ignore this email.</Small>
  </EmailShell>
);

export default ReauthenticationEmail;
