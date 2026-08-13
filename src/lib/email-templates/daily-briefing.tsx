import * as React from "react";
import { Column, Row, Section, Text } from "@react-email/components";
import {
  appUrl,
  CTAGroup,
  EmailShell,
  greetName,
  Headline,
  palette,
  Paragraph,
  PriorityList,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface BriefingAction {
  title: string;
  detail?: string;
  href?: string;
  badge?: string;
}

export interface DailyBriefingProps {
  firstName?: string;
  dateLabel?: string;
  readinessScore?: number;
  actions?: BriefingAction[];
  stats?: Array<{ label: string; value: string | number }>;
  insight?: string;
  dashboardUrl?: string;
  preferencesUrl?: string;
}

const StatCell = ({ label, value }: { label: string; value: string | number }) => (
  <Column
    style={{
      backgroundColor: palette.offWhite,
      border: `1px solid ${palette.gray}`,
      borderRadius: "10px",
      padding: "12px 10px",
      textAlign: "center" as const,
      width: "33%",
    }}
  >
    <Text
      style={{
        margin: "0 0 2px",
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: "22px",
        lineHeight: "26px",
        fontWeight: 700,
        color: palette.teal,
      }}
    >
      {value}
    </Text>
    <Text
      style={{
        margin: 0,
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: palette.muted,
      }}
    >
      {label}
    </Text>
  </Column>
);

const Email = ({
  firstName,
  dateLabel,
  readinessScore,
  actions = [],
  stats = [],
  insight,
  dashboardUrl,
  preferencesUrl,
}: DailyBriefingProps) => (
  <EmailShell
    preview={`Your career briefing${dateLabel ? ` for ${dateLabel}` : ""} — ${actions.length} priority action${
      actions.length === 1 ? "" : "s"
    }.`}
    eyebrow={dateLabel ? `Daily briefing · ${dateLabel}` : "Daily briefing"}
    preferencesUrl={preferencesUrl}
    footerNote="You're receiving this because daily briefings are switched on in your notification preferences."
  >
    <Headline>Today&apos;s career briefing</Headline>
    <Paragraph>
      Good morning {greetName(firstName)} — here&apos;s the shortlist that actually moves your search forward
      today
      {typeof readinessScore === "number" ? `. Your career readiness is at ${readinessScore}%` : ""}.
    </Paragraph>

    {stats.length > 0 ? (
      <Section style={{ margin: "0 0 20px" }}>
        <Row>
          {stats.slice(0, 3).map((stat, index) => (
            <React.Fragment key={stat.label}>
              {index > 0 ? <Column style={{ width: "10px" }}>&nbsp;</Column> : null}
              <StatCell label={stat.label} value={stat.value} />
            </React.Fragment>
          ))}
        </Row>
      </Section>
    ) : null}

    {actions.length > 0 ? (
      <PriorityList items={actions} />
    ) : (
      <Paragraph muted>
        Nothing urgent on your list today — a good moment to run a practice interview or refresh your resume.
      </Paragraph>
    )}

    {insight ? (
      <Section
        style={{
          borderLeft: `3px solid ${palette.mahogany}`,
          backgroundColor: palette.mahoganySoft,
          borderRadius: "10px",
          padding: "16px 18px",
          margin: "0 0 18px",
        }}
      >
        <Text
          style={{
            margin: "0 0 6px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: palette.mahogany,
          }}
        >
          Career insight
        </Text>
        <Text style={{ margin: 0, fontSize: "14px", lineHeight: "23px", color: palette.body }}>{insight}</Text>
      </Section>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(dashboardUrl, "/dashboard")}
      primaryLabel="Open my briefing"
      secondaryHref={appUrl(preferencesUrl, "/settings")}
      secondaryLabel="Briefing settings"
    />

    <Small>Delivered every morning, ranked by impact on your target role.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Your career briefing${data?.dateLabel ? ` · ${data.dateLabel}` : ""}`,
  displayName: "Daily Career Briefing",
  previewData: {
    firstName: "Andrew",
    dateLabel: "Thursday, 13 August",
    readinessScore: 74,
    stats: [
      { label: "Active apps", value: 12 },
      { label: "New matches", value: 6 },
      { label: "Interviews", value: 2 },
    ],
    actions: [
      {
        title: "Follow up with Northwind Labs",
        detail: "You applied 7 days ago and haven't heard back. A short nudge doubles response rates.",
        badge: "Do this first",
      },
      {
        title: "Close the analytics keyword gap",
        detail: "Adding 3 keywords lifts your ATS score from 78 to an estimated 86.",
      },
      {
        title: "Practice the behavioural round",
        detail: "Your last mock scored 62 on confidence — one 10-minute session moves it.",
      },
    ],
    insight:
      "Roles matching your profile in Dubai are being posted 22% faster than last month. Applications sent within 48 hours of posting are 3x more likely to get a first-round call.",
  },
} satisfies TemplateEntry;
