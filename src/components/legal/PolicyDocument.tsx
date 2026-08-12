import { useMemo } from "react";
import { extractHeadings, renderLegalMarkdown } from "@/lib/legal/markdown";

interface PolicyDocumentProps {
  body: string;
  /** Shown above the table of contents (version + effective date). */
  meta?: string;
  summary?: string | null;
}

/**
 * Renders a stored legal document body with a sticky table of contents.
 * Responsive: the TOC collapses above the text on small screens.
 */
export function PolicyDocument({ body, meta, summary }: PolicyDocumentProps) {
  const headings = useMemo(() => extractHeadings(body), [body]);
  const content = useMemo(() => renderLegalMarkdown(body), [body]);

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Table of contents" className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-border/60 bg-card/50 p-4">
          {meta && <p className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">{meta}</p>}
          <p className="mb-2 text-xs font-semibold text-foreground">On this page</p>
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1 text-xs lg:max-h-[60vh]">
            {headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className="block text-muted-foreground transition-colors hover:text-foreground">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="min-w-0 space-y-4">
        {summary && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            <p className="font-semibold">What changed in this version</p>
            <p className="mt-1 text-muted-foreground">{summary}</p>
          </div>
        )}
        <div className="space-y-4 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-foreground">
          {content}
        </div>
      </div>
    </div>
  );
}
