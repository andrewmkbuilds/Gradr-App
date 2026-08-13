import * as React from "react";
import { Section, Text } from "@react-email/components";
import {
  appUrl,
  CTAGroup,
  EmailShell,
  greetName,
  Headline,
  palette,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface InvoiceLine {
  description: string;
  quantity?: number;
  amount: string;
}

export interface InvoiceReceiptProps {
  firstName?: string;
  invoiceNumber?: string;
  issuedAt?: string;
  billedTo?: string;
  lines?: InvoiceLine[];
  subtotal?: string;
  discount?: string;
  tax?: string;
  total?: string;
  paymentMethod?: string;
  invoiceUrl?: string;
  billingUrl?: string;
}

const cell: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif',
  fontSize: "13px",
  lineHeight: "20px",
  color: palette.body,
  padding: "10px 12px",
  borderTop: `1px solid ${palette.gray}`,
};

const Email = ({
  firstName,
  invoiceNumber = "—",
  issuedAt,
  billedTo,
  lines = [],
  subtotal,
  discount,
  tax,
  total = "—",
  paymentMethod,
  invoiceUrl,
  billingUrl,
}: InvoiceReceiptProps) => (
  <EmailShell preview={`Receipt ${invoiceNumber} from Gradr.`} eyebrow="Receipt">
    <Headline>Receipt {invoiceNumber}</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — here&apos;s your itemised receipt from Gradr. No action is required; this is
      for your records.
    </Paragraph>

    <Section style={{ margin: "0 0 18px" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td style={{ ...cell, borderTop: "none", padding: "0 0 4px", color: palette.muted, fontSize: "12px" }}>
              Billed to
            </td>
            <td
              align="right"
              style={{ ...cell, borderTop: "none", padding: "0 0 4px", color: palette.muted, fontSize: "12px" }}
            >
              Issued
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, borderTop: "none", padding: 0, fontWeight: 600, color: palette.ink }}>
              {billedTo || "Your account"}
            </td>
            <td align="right" style={{ ...cell, borderTop: "none", padding: 0, fontWeight: 600, color: palette.ink }}>
              {issuedAt || new Date().toDateString()}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>

    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{
        border: `1px solid ${palette.gray}`,
        borderRadius: "10px",
        backgroundColor: palette.offWhite,
        margin: "0 0 18px",
      }}
    >
      <tbody>
        <tr>
          <td
            style={{
              ...cell,
              borderTop: "none",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: palette.mahogany,
            }}
          >
            Description
          </td>
          <td
            align="right"
            style={{
              ...cell,
              borderTop: "none",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: palette.mahogany,
            }}
          >
            Amount
          </td>
        </tr>
        {lines.map((line) => (
          <tr key={line.description}>
            <td style={cell}>
              {line.description}
              {line.quantity && line.quantity > 1 ? ` × ${line.quantity}` : ""}
            </td>
            <td align="right" style={{ ...cell, fontWeight: 600, color: palette.ink }}>
              {line.amount}
            </td>
          </tr>
        ))}
        {subtotal ? (
          <tr>
            <td style={{ ...cell, color: palette.muted }}>Subtotal</td>
            <td align="right" style={cell}>
              {subtotal}
            </td>
          </tr>
        ) : null}
        {discount ? (
          <tr>
            <td style={{ ...cell, color: palette.muted }}>Discount</td>
            <td align="right" style={{ ...cell, color: palette.mahogany, fontWeight: 600 }}>
              {discount}
            </td>
          </tr>
        ) : null}
        {tax ? (
          <tr>
            <td style={{ ...cell, color: palette.muted }}>Tax</td>
            <td align="right" style={cell}>
              {tax}
            </td>
          </tr>
        ) : null}
        <tr>
          <td style={{ ...cell, fontWeight: 700, color: palette.ink, fontSize: "15px" }}>Total paid</td>
          <td align="right" style={{ ...cell, fontWeight: 700, color: palette.teal, fontSize: "17px" }}>
            {total}
          </td>
        </tr>
      </tbody>
    </table>

    {paymentMethod ? (
      <Text style={{ margin: "0 0 16px", fontSize: "13px", color: palette.muted }}>
        Paid with {paymentMethod}.
      </Text>
    ) : null}

    <CTAGroup
      primaryHref={appUrl(invoiceUrl, "/billing")}
      primaryLabel="Download invoice"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="Billing history"
    />

    <Small>Need a VAT number or company details on this invoice? Reply and we&apos;ll reissue it.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `Your Gradr receipt ${data?.invoiceNumber || ""}`.trim(),
  displayName: "Invoice / receipt",
  previewData: {
    firstName: "Andrew",
    invoiceNumber: "GR-2026-00184",
    billedTo: "andrew@example.com",
    issuedAt: "13 August 2026",
    lines: [{ description: "Gradr Pro — monthly", quantity: 1, amount: "$19.00" }],
    subtotal: "$19.00",
    total: "$19.00",
    paymentMethod: "Visa ending 4242",
  },
} satisfies TemplateEntry;
