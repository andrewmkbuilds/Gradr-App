import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { POLICIES_V1_EFFECTIVE, SUBPROCESSORS_V1 } from "@/content/legalPolicies";

export default function Subprocessors() {
  return (
    <LegalPage
      title="Sub-processors"
      intro="Every third-party service that can process personal data on Gradr's behalf, what it receives, and where it processes it."
      lastUpdated={POLICIES_V1_EFFECTIVE}
    >
      <PolicyDocument body={SUBPROCESSORS_V1} meta={`Effective ${POLICIES_V1_EFFECTIVE}`} />
    </LegalPage>
  );
}
