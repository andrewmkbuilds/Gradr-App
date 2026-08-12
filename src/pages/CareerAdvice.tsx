import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { ArrowRight, Search } from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { FaqBlock } from "@/components/seo/FaqBlock";
import { GUIDES, guidePath } from "@/content/guides";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import {
  buildBreadcrumbLd,
  buildCollectionPageLd,
  buildFaqLd,
  buildItemListLd,
} from "@/lib/structuredData";

const INDEX_FAQS = [
  {
    question: "What does the Gradr career advice section cover?",
    answer:
      "Practical guides for the three moments that decide most job searches: optimizing your resume so it parses and persuades, writing a cover letter that adds information, and preparing answers for the interview questions that come up in nearly every process.",
  },
  {
    question: "Are these guides useful for career changers?",
    answer:
      "Yes. Each guide calls out how to handle transferable experience, gaps, and switching field, because those situations need a different emphasis rather than a different structure.",
  },
  {
    question: "Do I need a Gradr account to read the guides?",
    answer:
      "No. Every guide is free and public. An account is only needed for the tools that act on your own documents, such as resume scoring, tailored applications, and AI mock interviews.",
  },
];

export default function CareerAdvice() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    trackEvent("content_page_view", { article: "career-advice-index", location: "/career-advice" });
  }, []);

  // Debounced tracking of what readers search the guide index for.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => {
      trackEvent("guide_filter_search", {
        source: "career-advice-index",
        location: q.toLowerCase().slice(0, 60),
      });
    }, 900);
    return () => clearTimeout(t);
  }, [query]);


  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUIDES;
    return GUIDES.filter((g) =>
      [g.title, g.description, g.keyword, g.category].join(" ").toLowerCase().includes(q),
    );
  }, [query]);

  const jsonLd = [
    buildCollectionPageLd({
      path: "/career-advice",
      name: "Career advice",
      description:
        "Free, practical career guides on resume optimization, cover letters, and interview preparation.",
    }),
    buildItemListLd({
      name: "Career advice guides",
      items: GUIDES.map((g) => ({ name: g.title, path: guidePath(g.slug) })),
    }),
    buildFaqLd(INDEX_FAQS),
    buildBreadcrumbLd([
      { name: "Home", path: "/" },
      { name: "Career advice", path: "/career-advice" },
    ]),
  ];

  return (
    <PublicShell source="career-advice-index">
      <JsonLd nodes={jsonLd} label="career-advice-index" />

      <div className="space-y-10">
        <header className="space-y-3">
          <p className="text-sm font-medium text-primary">Career advice</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Guides for resumes, cover letters, and interviews
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Straightforward, evidence-first advice for the three points where most applications are
            won or lost. No filler, no invented statistics.
          </p>
        </header>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides"
            aria-label="Search career advice guides"
            className="h-11 pl-10"
          />
        </div>

        <section aria-label="Guides" className="grid gap-4 sm:grid-cols-2">
          {results.map((guide) => (
            <Link
              key={guide.slug}
              to={guidePath(guide.slug)}
              onClick={() =>
                trackEvent("guide_card_click", {
                  source: "career-advice-index",
                  destination: guidePath(guide.slug),
                  article: guide.slug,
                })
              }
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {guide.category} · {guide.readMinutes} min read
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">{guide.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{guide.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
                Read guide
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
            </Link>
          ))}
          {results.length === 0 && (
            <p className="text-sm text-muted-foreground">No guides match “{query}”.</p>
          )}
        </section>

        <FaqBlock items={INDEX_FAQS} source="career-advice-index" />

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Looking for roles instead?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse job search pages by role, location, and remote preference.
          </p>
          <Link
            to="/job-search"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
          >
            Explore job search pages
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </PublicShell>
  );
}
