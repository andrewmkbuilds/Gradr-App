import { Link } from "react-router-dom";
import { ScrollText, ExternalLink } from "lucide-react";
import { LEGAL_PAGES } from "@/content/legal";
import { usePublishedLegalDocument } from "@/hooks/useLegalDocuments";
import { useAcceptedLegalVersions } from "@/hooks/useLegalAcceptances";

/** Settings block linking to the current policies and the user's acceptance record. */
export function LegalLinksPanel() {
  const privacy = usePublishedLegalDocument("privacy");
  const terms = usePublishedLegalDocument("terms");
  const accepted = useAcceptedLegalVersions();

  return (
    <section className="rounded-xl border border-border/60 bg-card/50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Legal</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Privacy Notice v{privacy.document.version} (effective {privacy.document.effective_date}) ·
        Terms v{terms.document.version} (effective {terms.document.effective_date})
      </p>

      {accepted.length > 0 && (
        <ul className="mb-4 space-y-1 text-xs text-muted-foreground">
          {accepted.map((a) => (
            <li key={a.id}>
              You accepted {a.doc_type === "privacy" ? "the Privacy Notice" : "the Terms & Conditions"} v
              {a.version} on {new Date(a.accepted_at).toLocaleDateString()}.
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {LEGAL_PAGES.map((page) => (
          <Link
            key={page.path}
            to={page.path}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {page.label}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ))}
      </div>
    </section>
  );
}
