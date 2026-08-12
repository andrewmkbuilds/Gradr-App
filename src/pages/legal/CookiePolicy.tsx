import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { CookiePreferencesButton } from "@/components/CookieConsent";
import { COOKIE_POLICY_EFFECTIVE, COOKIE_POLICY_V1 } from "@/content/legalExtra";
import { SELLER_LEGAL_NAME } from "@/content/legal";

export default function CookiePolicy() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro={`Which cookies and similar technologies ${SELLER_LEGAL_NAME} uses on Gradr, why, and how to change your choices.`}
      lastUpdated={COOKIE_POLICY_EFFECTIVE}
    >
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="mb-3 text-sm text-foreground">
          Change what you allow at any time — your choice is saved on this device for 12 months.
        </p>
        <CookiePreferencesButton />
      </div>
      <PolicyDocument body={COOKIE_POLICY_V1} meta={`Effective ${COOKIE_POLICY_EFFECTIVE}`} />
    </LegalPage>
  );
}
