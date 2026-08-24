import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { DISCLAIMER_V1, POLICIES_V1_EFFECTIVE } from "@/content/legalPolicies";

export default function Disclaimer() {
  return (
    <LegalPage
      title="Disclaimer & Limitation of Liability"
      intro="What Gradr does and does not promise, how third-party job listings are treated, and the limits of our liability — alongside the statutory rights you always keep."
      lastUpdated={POLICIES_V1_EFFECTIVE}
    >
      <PolicyDocument body={DISCLAIMER_V1} meta={`Effective ${POLICIES_V1_EFFECTIVE}`} />
    </LegalPage>
  );
}
