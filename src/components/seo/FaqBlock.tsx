import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqBlockProps {
  items: FaqItem[];
  title?: string;
  /** Page identifier used for analytics. */
  source: string;
  className?: string;
}

/**
 * Accessible FAQ accordion. The matching FAQPage JSON-LD is emitted separately
 * via <JsonLd /> so the markup and the schema always come from the same data.
 */
export function FaqBlock({ items, title = "Frequently asked questions", source, className }: FaqBlockProps) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="faq-heading">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="faq-heading" className="text-xl font-semibold text-foreground">
          {title}
        </h2>
      </div>

      {/* Disclosure list rather than <dl>: the answer panels expose
          role="region" for screen-reader navigation, which would conflict with
          the definition-list role contract. */}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {items.map((item, i) => {
          const expanded = open === i;
          return (
            <div key={item.question}>
              <h3 className="m-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`faq-answer-${i}`}
                  id={`faq-question-${i}`}
                  onClick={() => {
                    const next = expanded ? null : i;
                    setOpen(next);
                    if (next !== null) trackEvent("faq_open", { source, question: item.question });
                  }}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm font-medium text-foreground">{item.question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
              </h3>
              <div
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-question-${i}`}
                hidden={!expanded}
                className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground"
              >
                {item.answer}
              </div>
            </div>
          );
        })}
      </div>

    </section>
  );
}
