/**
 * Centralised community / social links so every surface points at the same
 * destination and a change here propagates everywhere.
 */

/** Official Gradr Discord — the community hub for users, partners and support. */
export const DISCORD_INVITE_URL = "https://discord.gg/uujhVW5f";

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
];
