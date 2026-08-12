import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { SELLER_LEGAL_NAME } from "@/content/legal";
import { usePublishedLegalDocument } from "@/hooks/useLegalDocuments";

export default function Terms() {
  const { document, body } = usePublishedLegalDocument("terms");

  return (
    <LegalPage
      title={document.title || "Terms & Conditions"}
      intro={`The agreement between you and ${SELLER_LEGAL_NAME} for the use of Gradr.`}
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
