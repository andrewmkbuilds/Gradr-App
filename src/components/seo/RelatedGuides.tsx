import { Link } from "@/lib/router-compat";
import { ArrowRight, BookOpen } from "lucide-react";
import { GUIDES_BY_SLUG, guidePath } from "@/content/guides";
import { trackEvent, withUtm } from "@/lib/analytics";

interface RelatedGuidesProps {
  slugs: string[];
  source: string;
  title?: string;
}

export function RelatedGuides({ slugs, source, title = "Related guides" }: RelatedGuidesProps) {
  const guides = slugs.map((s) => GUIDES_BY_SLUG[s]).filter(Boolean);
  if (!guides.length) return null;

  return (
    <section className="space-y-4" aria-labelledby="related-heading">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="related-heading" className="text-xl font-semibold text-foreground">
          {title}
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            to={withUtm(guidePath(guide.slug), {
              source: "internal",
              medium: "related",
              campaign: source,
              content: guide.slug,
            })}
            onClick={() =>
              trackEvent("related_guide_click", {
                source,
                destination: guidePath(guide.slug),
                article: guide.slug,
              })
            }
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{guide.category}</p>
            <p className="mt-1 font-medium text-foreground">{guide.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{guide.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
              Read guide
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
