/**
 * Gradr email design kit — "Yacht Club".
 *
 * Every transactional template composes these primitives so the whole email
 * system shares one visual identity. Email clients (Outlook especially) only
 * reliably support table layouts + inline styles, so everything here is inline
 * styled, table-based and max 600px wide.
 *
 * Palette
 *   Deep Ocean Teal  #245F73  — primary brand / primary CTA
 *   Mahogany         #733E24  — secondary accent (rails, labels, links, chips)
 *   Off-white        #F2F0EF  — surfaces
 *   Cool Gray        #BBBDBC  — hairlines / muted
 */
import * as React from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export const SITE_URL = "https://gradr.me";

export const palette = {
  teal: "#245F73",
  tealDark: "#173F4E",
  tealSoft: "#E4EDF0",
  mahogany: "#733E24",
  mahoganySoft: "#F4EAE4",
  offWhite: "#F2F0EF",
  gray: "#BBBDBC",
  ink: "#12262E",
  body: "#3D4A50",
  muted: "#6B787E",
  white: "#FFFFFF",
  success: "#1F6B4F",
  successSoft: "#E6F1EC",
  warning: "#8A5A12",
  warningSoft: "#FBF0DC",
  danger: "#8C2F22",
  dangerSoft: "#FAE9E6",
};

export type Tone = "teal" | "mahogany" | "success" | "warning" | "danger" | "neutral";

export const toneColor = (tone: Tone = "teal") =>
  tone === "mahogany"
    ? { fg: palette.mahogany, bg: palette.mahoganySoft }
    : tone === "success"
      ? { fg: palette.success, bg: palette.successSoft }
      : tone === "warning"
        ? { fg: palette.warning, bg: palette.warningSoft }
        : tone === "danger"
          ? { fg: palette.danger, bg: palette.dangerSoft }
          : tone === "neutral"
            ? { fg: palette.muted, bg: palette.offWhite }
            : { fg: palette.teal, bg: palette.tealSoft };

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';
const serifStack = 'Georgia, "Times New Roman", "Iowan Old Style", serif';

/** Build an absolute app URL from a path or pass an absolute URL through. */
export const appUrl = (pathOrUrl?: string, fallback = "/dashboard") => {
  const value = pathOrUrl && pathOrUrl.length > 0 ? pathOrUrl : fallback;
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
};

/** First name with a safe, friendly fallback. */
export const greetName = (firstName?: string) => (firstName || "").trim().split(" ")[0] || "there";

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: 0,
  padding: 0,
  fontFamily: fontStack,
  WebkitFontSmoothing: "antialiased",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  padding: "0 16px",
};

export interface ShellProps {
  /** Inbox preview line — always set something useful. */
  preview: string;
  /** Small uppercase label above the headline (e.g. "Interview report"). */
  eyebrow?: string;
  /** Accent used for the eyebrow rail + top hairline. */
  accent?: "teal" | "mahogany";
  children: React.ReactNode;
  /** Optional preferences deep-link shown in the footer. */
  preferencesUrl?: string;
  /** Footer note appended above the legal line. */
  footerNote?: string;
}

export const EmailShell = ({
  preview,
  eyebrow,
  accent = "teal",
  children,
  preferencesUrl,
  footerNote,
}: ShellProps) => {
  const accentColor = accent === "mahogany" ? palette.mahogany : palette.teal;
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Top accent rule */}
          <Section style={{ paddingTop: "28px" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      height: "3px",
                      lineHeight: "3px",
                      fontSize: 0,
                      backgroundColor: accentColor,
                      borderRadius: "3px",
                    }}
                  >
                    &nbsp;
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Header */}
          <Section style={{ padding: "20px 0 4px" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td align="left" style={{ verticalAlign: "middle" }}>
                    <Link href={SITE_URL}>
                      <Img
                        src={`${SITE_URL}/gradr-logo-256.png`}
                        width="112"
                        alt="Gradr"
                        style={{ display: "block", border: 0, outline: "none", height: "auto" }}
                      />
                    </Link>
                  </td>
                  <td
                    align="right"
                    style={{
                      verticalAlign: "middle",
                      fontFamily: fontStack,
                      fontSize: "11px",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: palette.muted,
                    }}
                  >
                    AI Career Copilot
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Card */}
          <Section
            style={{
              backgroundColor: palette.white,
              border: `1px solid ${palette.gray}`,
              borderRadius: "16px",
              padding: "32px 28px",
              marginTop: "16px",
            }}
          >
            {eyebrow ? <Eyebrow accent={accent}>{eyebrow}</Eyebrow> : null}
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ padding: "24px 8px 40px" }}>
            {footerNote ? (
              <Text
                style={{
                  margin: "0 0 12px",
                  fontFamily: fontStack,
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: palette.muted,
                }}
              >
                {footerNote}
              </Text>
            ) : null}
            <Hr style={{ borderColor: palette.gray, borderStyle: "solid", margin: "0 0 16px" }} />
            <Text
              style={{
                margin: "0 0 8px",
                fontFamily: serifStack,
                fontSize: "15px",
                color: palette.teal,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              Gradr
            </Text>
            <Text
              style={{
                margin: "0 0 12px",
                fontFamily: fontStack,
                fontSize: "12px",
                lineHeight: "20px",
                color: palette.muted,
              }}
            >
              {[
                { label: "Support", href: `${SITE_URL}/support` },
                { label: "Preferences", href: appUrl(preferencesUrl, "/settings") },
                { label: "Privacy", href: `${SITE_URL}/privacy` },
                { label: "Terms", href: `${SITE_URL}/terms` },
              ].map((item, index) => (
                <React.Fragment key={item.label}>
                  {index > 0 ? <span style={{ color: palette.gray }}>{"  ·  "}</span> : null}
                  <Link href={item.href} style={{ color: palette.mahogany, textDecoration: "none" }}>
                    {item.label}
                  </Link>
                </React.Fragment>
              ))}
            </Text>
            <Text
              style={{
                margin: 0,
                fontFamily: fontStack,
                fontSize: "11px",
                lineHeight: "18px",
                color: palette.muted,
              }}
            >
              © {new Date().getFullYear()} Gradr. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const Eyebrow = ({
  children,
  accent = "teal",
}: {
  children: React.ReactNode;
  accent?: "teal" | "mahogany";
}) => (
  <Text
    style={{
      margin: "0 0 12px",
      fontFamily: fontStack,
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: accent === "mahogany" ? palette.mahogany : palette.teal,
      borderLeft: `3px solid ${accent === "mahogany" ? palette.mahogany : palette.teal}`,
      paddingLeft: "10px",
    }}
  >
    {children}
  </Text>
);

export const Headline = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      margin: "0 0 14px",
      fontFamily: serifStack,
      fontSize: "28px",
      lineHeight: "34px",
      fontWeight: 700,
      color: palette.ink,
      letterSpacing: "-0.01em",
    }}
  >
    {children}
  </Text>
);

export const Paragraph = ({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) => (
  <Text
    style={{
      margin: "0 0 16px",
      fontFamily: fontStack,
      fontSize: "15px",
      lineHeight: "25px",
      color: muted ? palette.muted : palette.body,
    }}
  >
    {children}
  </Text>
);

export const Small = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      margin: "0 0 8px",
      fontFamily: fontStack,
      fontSize: "13px",
      lineHeight: "21px",
      color: palette.muted,
    }}
  >
    {children}
  </Text>
);

export const Divider = () => (
  <Hr style={{ borderColor: palette.gray, borderStyle: "solid", margin: "24px 0" }} />
);

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export const CTAButton = ({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) => {
  const primary = variant === "primary";
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ margin: "4px 0 8px" }}>
      <tbody>
        <tr>
          <td
            align="center"
            style={{
              backgroundColor: primary ? palette.teal : palette.white,
              border: `2px solid ${primary ? palette.teal : palette.mahogany}`,
              borderRadius: "10px",
            }}
          >
            <Link
              href={href}
              style={{
                display: "inline-block",
                padding: "13px 26px",
                fontFamily: fontStack,
                fontSize: "15px",
                fontWeight: 700,
                lineHeight: "20px",
                color: primary ? palette.white : palette.mahogany,
                textDecoration: "none",
                minWidth: "160px",
                textAlign: "center",
              }}
            >
              {children}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

/** Two buttons that stack on narrow screens (React Email Row/Column handles it). */
export const CTAGroup = ({
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) => (
  <Row style={{ marginTop: "8px" }}>
    <Column style={{ paddingRight: secondaryHref ? "8px" : 0, width: secondaryHref ? "50%" : "100%" }}>
      <CTAButton href={primaryHref}>{primaryLabel}</CTAButton>
    </Column>
    {secondaryHref && secondaryLabel ? (
      <Column style={{ width: "50%" }}>
        <CTAButton href={secondaryHref} variant="secondary">
          {secondaryLabel}
        </CTAButton>
      </Column>
    ) : null}
  </Row>
);

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const Card = ({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}) => {
  const { fg, bg } = toneColor(tone);
  return (
    <Section
      style={{
        backgroundColor: bg,
        borderLeft: `3px solid ${fg}`,
        borderRadius: "10px",
        padding: "16px 18px",
        margin: "0 0 18px",
      }}
    >
      {title ? (
        <Text
          style={{
            margin: "0 0 6px",
            fontFamily: fontStack,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: fg,
          }}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </Section>
  );
};

export const Badge = ({ children, tone = "teal" }: { children: React.ReactNode; tone?: Tone }) => {
  const { fg, bg } = toneColor(tone);
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: bg,
        color: fg,
        border: `1px solid ${fg}`,
        borderRadius: "999px",
        padding: "3px 11px",
        fontFamily: fontStack,
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
};

/** Big hero metric, e.g. an ATS score. */
export const ScoreBlock = ({
  value,
  label,
  suffix = "",
  tone = "teal",
  caption,
}: {
  value: number | string;
  label: string;
  suffix?: string;
  tone?: Tone;
  caption?: string;
}) => {
  const { fg, bg } = toneColor(tone);
  return (
    <Section
      style={{
        backgroundColor: bg,
        border: `1px solid ${fg}`,
        borderRadius: "14px",
        padding: "22px 20px",
        margin: "0 0 18px",
        textAlign: "center" as const,
      }}
    >
      <Text
        style={{
          margin: "0 0 2px",
          fontFamily: serifStack,
          fontSize: "44px",
          lineHeight: "48px",
          fontWeight: 700,
          color: fg,
        }}
      >
        {value}
        {suffix}
      </Text>
      <Text
        style={{
          margin: 0,
          fontFamily: fontStack,
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: fg,
        }}
      >
        {label}
      </Text>
      {caption ? (
        <Text
          style={{
            margin: "8px 0 0",
            fontFamily: fontStack,
            fontSize: "13px",
            lineHeight: "20px",
            color: palette.body,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </Section>
  );
};

/** Horizontal bar meter — pure table cells so it renders in Outlook. */
export const Meter = ({
  label,
  value,
  max = 100,
  tone = "teal",
  display,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: Tone;
  display?: string;
}) => {
  const { fg } = toneColor(tone);
  const pct = Math.max(0, Math.min(100, Math.round((value / (max || 100)) * 100)));
  return (
    <Section style={{ margin: "0 0 14px" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td
              style={{
                fontFamily: fontStack,
                fontSize: "13px",
                fontWeight: 600,
                color: palette.body,
                paddingBottom: "6px",
              }}
            >
              {label}
            </td>
            <td
              align="right"
              style={{
                fontFamily: fontStack,
                fontSize: "13px",
                fontWeight: 700,
                color: fg,
                paddingBottom: "6px",
              }}
            >
              {display ?? `${value}/${max}`}
            </td>
          </tr>
        </tbody>
      </table>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={{ backgroundColor: palette.offWhite, borderRadius: "999px" }}
      >
        <tbody>
          <tr>
            <td
              width={`${pct}%`}
              style={{
                backgroundColor: fg,
                height: "8px",
                lineHeight: "8px",
                fontSize: 0,
                borderRadius: "999px",
              }}
            >
              &nbsp;
            </td>
            <td style={{ height: "8px", lineHeight: "8px", fontSize: 0 }}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
};

/** Label/value detail table (receipts, job facts, subscription facts). */
export const DetailTable = ({
  rows,
  accent = "mahogany",
}: {
  rows: Array<{ label: string; value: React.ReactNode; strong?: boolean }>;
  accent?: "teal" | "mahogany";
}) => (
  <table
    role="presentation"
    width="100%"
    cellPadding={0}
    cellSpacing={0}
    border={0}
    style={{
      border: `1px solid ${palette.gray}`,
      borderRadius: "10px",
      margin: "0 0 18px",
      backgroundColor: palette.offWhite,
    }}
  >
    <tbody>
      {rows.map((row, index) => (
        <tr key={row.label}>
          <td
            style={{
              padding: "11px 16px",
              fontFamily: fontStack,
              fontSize: "13px",
              color: palette.muted,
              borderTop: index === 0 ? "none" : `1px solid ${palette.gray}`,
              width: "48%",
            }}
          >
            {row.label}
          </td>
          <td
            align="right"
            style={{
              padding: "11px 16px",
              fontFamily: fontStack,
              fontSize: row.strong ? "15px" : "13px",
              fontWeight: row.strong ? 700 : 600,
              color: row.strong ? (accent === "mahogany" ? palette.mahogany : palette.teal) : palette.ink,
              borderTop: index === 0 ? "none" : `1px solid ${palette.gray}`,
            }}
          >
            {row.value}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** Bulleted list rendered with table rows so bullets never wrap oddly. */
export const BulletList = ({
  items,
  tone = "teal",
}: {
  items: React.ReactNode[];
  tone?: Tone;
}) => {
  const { fg } = toneColor(tone);
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ margin: "0 0 16px" }}>
      <tbody>
        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <tr key={index}>
            <td
              width="18"
              style={{
                verticalAlign: "top",
                fontFamily: fontStack,
                fontSize: "15px",
                lineHeight: "24px",
                color: fg,
                fontWeight: 700,
                paddingBottom: "8px",
              }}
            >
              ·
            </td>
            <td
              style={{
                fontFamily: fontStack,
                fontSize: "14px",
                lineHeight: "23px",
                color: palette.body,
                paddingBottom: "8px",
              }}
            >
              {item}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** Numbered priority list used by the Daily Briefing. */
export const PriorityList = ({
  items,
}: {
  items: Array<{ title: string; detail?: string; href?: string; badge?: string }>;
}) => (
  <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ margin: "0 0 18px" }}>
    <tbody>
      {items.map((item, index) => (
        <tr key={item.title}>
          <td
            style={{
              padding: "14px 16px",
              border: `1px solid ${palette.gray}`,
              borderRadius: "10px",
              backgroundColor: index === 0 ? palette.mahoganySoft : palette.offWhite,
              borderLeft: `3px solid ${index === 0 ? palette.mahogany : palette.teal}`,
            }}
          >
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      fontFamily: fontStack,
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: index === 0 ? palette.mahogany : palette.teal,
                      paddingBottom: "4px",
                    }}
                  >
                    {item.badge || `Priority ${index + 1}`}
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      fontFamily: fontStack,
                      fontSize: "15px",
                      fontWeight: 700,
                      lineHeight: "22px",
                      color: palette.ink,
                    }}
                  >
                    {item.href ? (
                      <Link href={item.href} style={{ color: palette.ink, textDecoration: "none" }}>
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </td>
                </tr>
                {item.detail ? (
                  <tr>
                    <td
                      style={{
                        fontFamily: fontStack,
                        fontSize: "13px",
                        lineHeight: "20px",
                        color: palette.body,
                        paddingTop: "4px",
                      }}
                    >
                      {item.detail}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** Spacer row (Outlook-safe). */
export const Spacer = ({ height = 12 }: { height?: number }) => (
  <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
    <tbody>
      <tr>
        <td style={{ height: `${height}px`, lineHeight: `${height}px`, fontSize: 0 }}>&nbsp;</td>
      </tr>
    </tbody>
  </table>
);

export const InlineLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} style={{ color: palette.mahogany, fontWeight: 600, textDecoration: "underline" }}>
    {children}
  </Link>
);
