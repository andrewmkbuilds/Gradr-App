/**
 * Centralised community / social links so every surface points at the same
 * destination and a change here propagates everywhere.
 */

/** Official Gradr Discord — the community hub for users, partners and support. */
export const DISCORD_INVITE_URL = "https://discord.gg/uujhVW5f";

/** Official Gradr Facebook page — news, product updates and announcements. */
export const FACEBOOK_PAGE_URL = "https://www.facebook.com/gradr.me/";

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
