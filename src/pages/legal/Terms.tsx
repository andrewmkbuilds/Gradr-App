import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { REFUND_WINDOW_DAYS, SELLER_CONTACT_EMAIL, SELLER_LEGAL_NAME, SELLER_TRADING_NAME } from "@/content/legal";
import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro={`The agreement between you and ${SELLER_LEGAL_NAME} for the use of Gradr.`}
    >
      <LegalSection heading="1. Who you are contracting with">
        <p>
          Gradr is operated by <strong>{SELLER_LEGAL_NAME}</strong> (trading as{" "}
          {SELLER_TRADING_NAME}), contactable at <strong>{SELLER_CONTACT_EMAIL}</strong>. By creating
          an account or purchasing a plan you agree to these terms.
        </p>
      </LegalSection>

      <LegalSection heading="2. Payments and Merchant of Record">
        <p>
          Our order process is conducted by our online reseller{" "}
          <strong>Paddle.com</strong>. Paddle.com is the <strong>Merchant of Record</strong> for all
          our orders and handles all customer service enquiries relating to payments, invoices, taxes
          and refunds. Paddle's own buyer terms apply in addition to these terms.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts">
        <p>
          You must provide accurate information, keep your credentials secure and are responsible for
          all activity on your account. Accounts are personal to you and may not be shared or resold.
          You must be at least 16 years old.
        </p>
      </LegalSection>

      <LegalSection heading="4. Plans, credits and billing">
        <ul className="space-y-1">
          <li>Free, Starter, Pro and Advanced plans each carry monthly usage entitlements.</li>
          <li>
            Subscriptions renew automatically each month or year until cancelled. You can cancel at
            any time from the billing page; access continues to the end of the paid period.
          </li>
          <li>
            Pay-per-use credit packs are consumed as you use AI features and do not expire while your
            account is active.
          </li>
          <li>Prices are shown localized and inclusive of applicable taxes where required.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Refunds">
        <p>
          We offer a {REFUND_WINDOW_DAYS}-day refund window. Full details are in our{" "}
          <Link to="/refund-policy" className="text-primary underline">
            Refund Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <p>You agree not to:</p>
        <ul className="space-y-1">
          <li>Upload unlawful, infringing, hateful or deliberately deceptive content.</li>
          <li>Submit another person's personal data without their permission.</li>
          <li>
            Reverse engineer, scrape, resell, or use the service to build a competing product, or
            circumvent usage limits, rate limits or entitlement checks.
          </li>
          <li>Interfere with the security or availability of the service, or probe it without consent.</li>
          <li>Use generated material to misrepresent your qualifications or deceive an employer.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="7. AI-generated output">
        <p>
          Gradr uses AI models. Output may be inaccurate or incomplete, is provided for guidance only,
          and is not legal, financial or career advice. You remain responsible for reviewing anything
          you send to an employer. We do not guarantee interviews, offers or employment outcomes.
        </p>
      </LegalSection>

      <LegalSection heading="8. Intellectual property">
        <p>
          You retain ownership of the content you upload and of the output generated for you, and you
          grant us a limited licence to host and process it in order to provide the service. All
          software, branding, design and underlying models used in Gradr remain our property or that
          of our licensors. No rights are granted other than those set out here.
        </p>
      </LegalSection>

      <LegalSection heading="9. Suspension and termination">
        <p>
          We may suspend or terminate access — with notice where reasonably possible — if you breach
          these terms, if payment fails and is not resolved during the dunning period, or where
          required by law or to protect the service and other users. You may stop using Gradr and
          delete your account at any time from Settings. Suspension for cause does not entitle you to
          a refund of the current period beyond what the Refund Policy provides.
        </p>
      </LegalSection>

      <LegalSection heading="10. Availability and disclaimers">
        <p>
          The service is provided on an "as is" and "as available" basis. We do not warrant
          uninterrupted or error-free operation, and third-party providers (payments, AI, job data)
          may change or become unavailable.
        </p>
      </LegalSection>

      <LegalSection heading="11. Liability">
        <p>
          To the maximum extent permitted by law, our aggregate liability is limited to the amount you
          paid in the twelve months before the claim, and we are not liable for indirect or
          consequential loss, lost profits or lost opportunities. Nothing limits liability that cannot
          be limited by law, including your statutory consumer rights.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes and contact">
        <p>
          We may update these terms; material changes will be notified in-app or by email before they
          take effect. Questions: <strong>{SELLER_CONTACT_EMAIL}</strong>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
