/**
 * Centralised community / social links so every surface points at the same
 * destination and a change here propagates everywhere.
 */

/** Official Gradr Discord — the community hub for users, partners and support. */
export const DISCORD_INVITE_URL = "https://discord.gg/uujhVW5f";

/** Official Gradr Facebook page — news, product updates and announcements. */
export const FACEBOOK_PAGE_URL = "https://www.facebook.com/gradr.me/";

/** Official Gradr Instagram — career tips, product highlights and community. */
export const INSTAGRAM_URL = "https://www.instagram.com/gradr.me/";

/** Official Gradr X (Twitter) account — announcements and conversation. */
export const X_URL = "https://x.com/gradr_me";

/** Official Gradr YouTube channel — interviews, walkthroughs and demos. */
export const YOUTUBE_URL = "https://www.youtube.com/@gradr-me";

export type SocialLink = {
  /** Accessible label, e.g. "Gradr on Instagram". */
  label: string;
  href: string;
};

/** Official social-media profiles, in footer display order. */
export const SOCIAL_LINKS: SocialLink[] = [
  { label: "Gradr on Instagram", href: INSTAGRAM_URL },
  { label: "Gradr on X", href: X_URL },
  { label: "Gradr on Facebook", href: FACEBOOK_PAGE_URL },
  { label: "Gradr on YouTube", href: YOUTUBE_URL },
];

export type CommunityLink = {
  label: string;
  href: string;
  /** Short description shown beside the link in card layouts. */
  description: string;
};

export const COMMUNITY_LINKS: CommunityLink[] = [
  {
    label: "Discord",
    href: DISCORD_INVITE_URL,
    description: "Join the Gradr community for help, product updates and sneak peeks.",
  },
  {
    label: "Facebook",
    href: FACEBOOK_PAGE_URL,
    description: "Follow Gradr for product news, announcements and career tips.",
  },
];
