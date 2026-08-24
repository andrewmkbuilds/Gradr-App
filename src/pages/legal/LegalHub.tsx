import { Link } from "react-router-dom";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL_INDEX, SELLER_CONTACT_EMAIL, SELLER_TRADING_NAME, SELLER_WEBSITE_URL } from "@/content/legal";
import {
  BILLING_CONTACT_EMAIL,
  COMPANY,
  LEGAL_CONTACT_EMAIL,
  PRIVACY_CONTACT_EMAIL,
  SECURITY_CONTACT_EMAIL,
  displayEntityName,
  identityValue,
  pendingIdentityFields,
} from "@/content/companyIdentity";

/**
 * Single discoverable index of every Gradr policy plus the business identity
 * and contact surface. Identity facts that the owner has not supplied render
 * as an explicit placeholder — we never print an invented entity, address,
 * registration number or tax id.
 */
export default function LegalHub() {
  const pending = pendingIdentityFields();
  return (
    <LegalPage
      title="Legal & contact"
      intro={`Every policy that governs ${SELLER_TRADING_NAME}, plus how to reach the right team.`}
    >
      <section className="space-y-4">
        <h2>Policies</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LEGAL_INDEX.map((page) => (
            <li key={page.path} className="!ml-0 !list-none">
              <Link
                to={page.path}
                className="block h-full rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40"
              >
                <span className="block font-medium text-foreground">{page.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{page.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Contact</h2>
        <ul>
          <li>
            General support — <a className="text-primary" href={`mailto:${SELLER_CONTACT_EMAIL}`}>{SELLER_CONTACT_EMAIL}</a>
          </li>
          <li>
            Privacy and data rights — <a className="text-primary" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
          </li>
          <li>
            Legal notices — <a className="text-primary" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          </li>
          <li>
            Billing and refunds — <a className="text-primary" href={`mailto:${BILLING_CONTACT_EMAIL}`}>{BILLING_CONTACT_EMAIL}</a>
          </li>
          <li>
            Security reports — <a className="text-primary" href={`mailto:${SECURITY_CONTACT_EMAIL}`}>{SECURITY_CONTACT_EMAIL}</a>
          </li>
        </ul>
        <p>
          We answer support and privacy requests by email. Privacy requests are handled within the
          statutory deadline that applies to you (one month under UK/EU GDPR).
        </p>
      </section>

      <section className="space-y-3">
        <h2>Business identity</h2>
        <p>
          {SELLER_TRADING_NAME} is the trading name of the operator of {SELLER_WEBSITE_URL}. Paddle.com
          Market Ltd acts as merchant of record for all paid plans and appears on your receipt and card
          statement.
        </p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[220px_1fr]">
          <dt className="text-foreground">Trading name</dt>
          <dd>{SELLER_TRADING_NAME}</dd>
          <dt className="text-foreground">Registered entity</dt>
          <dd>{COMPANY.legalEntityName ? displayEntityName() : identityValue(COMPANY.legalEntityName)}</dd>
          <dt className="text-foreground">Registered address</dt>
          <dd>{COMPANY.registeredAddress?.join(", ") || identityValue(null)}</dd>
          <dt className="text-foreground">Registration number</dt>
          <dd>{identityValue(COMPANY.registrationNumber)}</dd>
          <dt className="text-foreground">Tax / VAT registration</dt>
          <dd>{identityValue(COMPANY.taxNumber)}</dd>
          <dt className="text-foreground">Governing law</dt>
          <dd>{identityValue(COMPANY.governingLaw)}</dd>
          <dt className="text-foreground">Data protection contact</dt>
          <dd>{COMPANY.dataProtectionContact || PRIVACY_CONTACT_EMAIL}</dd>
        </dl>
        {pending.length > 0 && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
            <strong>Pre-launch notice:</strong> the fields marked “[TO BE PROVIDED BY GRADR]” above are
            not yet published because the verified details have not been supplied. They must be
            completed before Gradr trades publicly — we do not display placeholder or invented company
            information as if it were fact.
          </p>
        )}
      </section>
    </LegalPage>
  );
}
