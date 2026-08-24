import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { ACCEPTABLE_USE_V1, POLICIES_V1_EFFECTIVE } from "@/content/legalPolicies";

export default function AcceptableUse() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      intro="What you may and may not do with Gradr — content standards, prohibited technical activity, and how we enforce them."
      lastUpdated={POLICIES_V1_EFFECTIVE}
    >
      <PolicyDocument body={ACCEPTABLE_USE_V1} meta={`Effective ${POLICIES_V1_EFFECTIVE}`} />
    </LegalPage>
  );
}
