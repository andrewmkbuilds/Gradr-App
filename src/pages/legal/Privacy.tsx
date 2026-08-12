import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { SELLER_LEGAL_NAME } from "@/content/legal";
import { usePublishedLegalDocument } from "@/hooks/useLegalDocuments";

export default function Privacy() {
  const { document, body } = usePublishedLegalDocument("privacy");

  return (
    <LegalPage
      title={document.title || "Privacy Notice"}
      intro={`How ${SELLER_LEGAL_NAME} collects, uses and shares personal data when you use Gradr.`}
      lastUpdated={document.effective_date}
    >
      <PolicyDocument
        body={body}
        meta={`Version ${document.version} · effective ${document.effective_date}`}
        summary={document.version > 1 ? document.summary_of_changes : null}
      />
    </LegalPage>
  );
}
