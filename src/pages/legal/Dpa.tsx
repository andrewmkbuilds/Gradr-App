import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { DPA_EFFECTIVE, DPA_V1 } from "@/content/legalExtra";
import { SELLER_CONTACT_EMAIL, SELLER_LEGAL_NAME } from "@/content/legal";

export default function Dpa() {
  return (
    <LegalPage
      title="Data Processing Addendum"
      intro={`The terms under which ${SELLER_LEGAL_NAME} processes personal data on behalf of organisations that provide Gradr to their members.`}
      lastUpdated={DPA_EFFECTIVE}
    >
      <div className="rounded-xl border border-border/60 bg-card/50 p-4 text-sm">
        <p className="text-foreground">
          Need a countersigned copy for your organisation? Email{" "}
          <a href={`mailto:${SELLER_CONTACT_EMAIL}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {SELLER_CONTACT_EMAIL}
          </a>{" "}
          with your legal entity name, jurisdiction and signatory.
        </p>
      </div>
      <PolicyDocument body={DPA_V1} meta={`Effective ${DPA_EFFECTIVE}`} />
    </LegalPage>
  );
}
