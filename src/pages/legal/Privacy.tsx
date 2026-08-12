import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { SELLER_CONTACT_EMAIL, SELLER_LEGAL_NAME, SELLER_TRADING_NAME } from "@/content/legal";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Notice"
      intro={`How ${SELLER_LEGAL_NAME} collects, uses and shares personal data when you use Gradr.`}
    >
      <LegalSection heading="Who we are">
        <p>
          <strong>{SELLER_LEGAL_NAME}</strong> (trading as {SELLER_TRADING_NAME}) is the data
          controller for personal data processed through the Gradr application and website. You can
          reach us at <strong>{SELLER_CONTACT_EMAIL}</strong> for any privacy request.
        </p>
      </LegalSection>

      <LegalSection heading="Personal data we collect">
        <ul className="space-y-1">
          <li>
            <strong>Account data:</strong> name, email address, authentication identifiers and
            provider (email, Google, Apple, Microsoft).
          </li>
          <li>
            <strong>Career content you upload:</strong> resumes, cover letters, job descriptions,
            application notes and portfolio links.
          </li>
          <li>
            <strong>Interview data:</strong> mock interview transcripts, audio streamed during a
            live session, scores and generated feedback reports.
          </li>
          <li>
            <strong>Usage and device data:</strong> pages viewed, features used, feature usage
            counters, IP address, browser and device type, and error diagnostics.
          </li>
          <li>
            <strong>Billing data:</strong> plan, subscription status, transaction identifiers and
            country of purchase. Card details are never seen or stored by us.
          </li>
          <li>
            <strong>Communications:</strong> support messages and email notification preferences.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we use it">
        <ul className="space-y-1">
          <li>To provide the service: analysing resumes, matching jobs and running AI interviews.</li>
          <li>To operate accounts, authenticate you and enforce plan entitlements and usage limits.</li>
          <li>To process payments, prevent fraud and meet tax and accounting obligations.</li>
          <li>To send service, security and (where you opt in) product emails.</li>
          <li>To monitor reliability, debug errors and improve the product in aggregate.</li>
        </ul>
        <p>
          We rely on performance of our contract with you, our legitimate interests in securing and
          improving the service, your consent for optional communications, and legal obligations for
          financial records.
        </p>
      </LegalSection>

      <LegalSection heading="Who we share data with">
        <p>We share personal data only with processors and partners that help us run Gradr:</p>
        <ul className="space-y-1">
          <li>
            <strong>Paddle.com Market Ltd</strong> — our payment processor and Merchant of Record.
            Paddle receives your billing name, email, country and transaction data and acts as an
            independent controller for payment and tax purposes.
          </li>
          <li>
            <strong>Supabase</strong> — database, authentication, storage and serverless functions.
          </li>
          <li>
            <strong>AI providers</strong> (including Google Gemini and OpenAI-compatible gateways) —
            process the content you submit to generate analyses, feedback and interview responses.
          </li>
          <li>
            <strong>Analytics and monitoring</strong> (PostHog, Sentry) — usage and error telemetry.
          </li>
          <li>
            <strong>Email delivery providers</strong> — to send transactional and digest emails.
          </li>
          <li>
            Authorities or acquirers where required by law or in connection with a corporate
            transaction.
          </li>
        </ul>
        <p>We do not sell personal data and we do not use your resume content to train our own models.</p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          Our providers may process data outside your country, including in the United States. Where
          required, transfers rely on Standard Contractual Clauses or an equivalent safeguard.
        </p>
      </LegalSection>

      <LegalSection heading="Retention">
        <p>
          Account and career content is kept while your account is active. Deleting your account from
          Settings permanently purges your resumes, interviews, applications and profile. Billing and
          tax records are retained for the period required by law (typically seven years).
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can access, correct, export or delete your data, object to or restrict processing,
          withdraw consent, and lodge a complaint with your supervisory authority. Export and account
          deletion are self-service in <strong>Settings → Data &amp; privacy</strong>; for anything
          else email {SELLER_CONTACT_EMAIL} and we will respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We use cookies and local storage that are strictly necessary for authentication, plus
          referral attribution cookies and privacy-respecting product analytics. You can clear these
          at any time from your browser.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>Gradr is not intended for anyone under 16, and we do not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          We will update this notice as the service evolves and revise the date above. Questions or
          requests: <strong>{SELLER_CONTACT_EMAIL}</strong>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
