import { Link } from "@/lib/router-compat";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { GUIDES, guidePath } from "@/content/guides";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/Reveal";

/** Long-form article that lives outside the guides registry. */
const FEATURED = {
  href: "/blog/ai-resume-optimization",
  title: "AI Resume Optimization: the complete guide",
  description:
    "How an AI resume builder actually improves callbacks — keyword coverage, ATS parsing, and the edits that move the needle.",
  category: "Resume",
  readMinutes: 9,
};

/**
 * Blog index. Previously /blog resolved to the 404 page even though articles
 * were published beneath it, so every inbound link and sitemap entry to the
 * section dead-ended here.
 */
export default function BlogIndex() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal>
        <header className="mb-10 max-w-2xl">
          <Badge variant="secondary" className="mb-4 gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Gradr blog
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Career guides and job search playbooks
          </h1>
          <p className="mt-3 text-muted-foreground">
            Practical, tested advice on resumes, applications, and interviews — written to be used the same day you read it.
          </p>
        </header>
      </Reveal>

      <Reveal delay={0.05}>
        <Link
          to={FEATURED.href}
          className="interactive group mb-10 block rounded-xl border border-border bg-surface-secondary p-6 transition-colors hover:border-primary/50"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge>{FEATURED.category}</Badge>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {FEATURED.readMinutes} min read
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{FEATURED.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{FEATURED.description}</p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            Read the guide
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </Reveal>

      <h2 className="mb-4 text-lg font-semibold tracking-tight">All guides</h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {GUIDES.map((guide, i) => (
          <li key={guide.slug}>
            <Reveal delay={0.03 * i}>
              <Card className="interactive h-full transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{guide.category}</Badge>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {guide.readMinutes} min
                    </span>
                  </div>
                  <CardTitle className="pt-2 text-base">
                    <Link to={guidePath(guide.slug)} className="after:absolute after:inset-0">
                      {guide.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{guide.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}
