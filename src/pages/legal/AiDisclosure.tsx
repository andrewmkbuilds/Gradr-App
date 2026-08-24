import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { AI_DISCLOSURE_V1, POLICIES_V1_EFFECTIVE } from "@/content/legalPolicies";

export default function AiDisclosure() {
  return (
    <LegalPage
      title="AI Usage & Disclaimer"
      intro="How Gradr uses AI, which providers process your content, what the output can and cannot be relied on for, and what stays your responsibility."
      lastUpdated={POLICIES_V1_EFFECTIVE}
    >
      <PolicyDocument body={AI_DISCLOSURE_V1} meta={`Effective ${POLICIES_V1_EFFECTIVE}`} />
    </LegalPage>
  );
}
