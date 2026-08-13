/**
 * Auth email templates plus realistic sample props.
 *
 * Shared by the admin auth-email preview page and the build-time image audit,
 * so both look at exactly the same six templates the auth webhook renders.
 * Sample action URLs mirror the shape Supabase Auth produces (token, type and
 * redirect_to preserved) — never a bare homepage link.
 */
import type { ComponentType } from "react";
import { SignupEmail } from "./signup";
import { InviteEmail } from "./invite";
import { MagicLinkEmail } from "./magic-link";
import { RecoveryEmail } from "./recovery";
import { EmailChangeEmail } from "./email-change";
import { ReauthenticationEmail } from "./reauthentication";

export const SITE_NAME = "Gradr";
export const ROOT_DOMAIN = "gradr.me";
const SITE_URL = `https://${ROOT_DOMAIN}`;
const SAMPLE_EMAIL = "user@example.test";

/** Supabase-shaped verification link, so previews show real link anatomy. */
export function sampleAuthUrl(type: string, next: string): string {
  const token = "pkce_9f1c4b2ae7d84f6f9a0c3e5b7d2f8a1c";
  return `${SITE_URL}/auth/callback?token_hash=${token}&type=${type}&redirect_to=${encodeURIComponent(
    `${SITE_URL}${next}`,
  )}`;
}

export interface AuthTemplateEntry {
  key: string;
  displayName: string;
  subject: string;
  component: ComponentType<any>;
  props: Record<string, unknown>;
}

export const AUTH_TEMPLATES: AuthTemplateEntry[] = [
  {
    key: "signup",
    displayName: "Confirm signup",
    subject: "Confirm your email for Gradr",
    component: SignupEmail,
    props: {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: SAMPLE_EMAIL,
      confirmationUrl: sampleAuthUrl("signup", "/welcome"),
    },
  },
  {
    key: "magiclink",
    displayName: "Magic link",
    subject: "Your Gradr sign-in link",
    component: MagicLinkEmail,
    props: {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: SAMPLE_EMAIL,
      magicLinkUrl: sampleAuthUrl("magiclink", "/"),
    },
  },
  {
    key: "recovery",
    displayName: "Password reset",
    subject: "Reset your Gradr password",
    component: RecoveryEmail,
    props: {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: SAMPLE_EMAIL,
      recoveryUrl: sampleAuthUrl("recovery", "/reset-password"),
    },
  },
  {
    key: "invite",
    displayName: "Invitation",
    subject: "You've been invited to Gradr",
    component: InviteEmail,
    props: {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: SAMPLE_EMAIL,
      inviteUrl: sampleAuthUrl("invite", "/welcome"),
    },
  },
  {
    key: "email_change",
    displayName: "Email change",
    subject: "Confirm your new Gradr email",
    component: EmailChangeEmail,
    props: {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: SAMPLE_EMAIL,
      newEmail: "new.address@example.test",
      confirmationUrl: sampleAuthUrl("email_change", "/settings"),
    },
  },
  {
    key: "reauthentication",
    displayName: "Verification code",
    subject: "Your Gradr verification code",
    component: ReauthenticationEmail,
    props: { siteName: SITE_NAME, siteUrl: SITE_URL, recipient: SAMPLE_EMAIL, token: "418902" },
  },
];

export function authTemplate(key: string): AuthTemplateEntry | undefined {
  return AUTH_TEMPLATES.find((t) => t.key === key);
}
