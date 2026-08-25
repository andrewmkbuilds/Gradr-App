import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { SurfaceShell } from "@/components/surface/SurfaceShell";
import { SLink, useSurfacePath, SurfaceNotFound } from "@/components/surface/SurfaceLink";
import { DOCS, DOCS_BY_SLUG, DOC_CATEGORIES, type DocArticle } from "@/content/docs";
import { CrossLink } from "@/components/surface/SurfaceLink";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowRight, BookOpen } from "lucide-react";

/** Left-hand documentation index, grouped by category. */
function DocsSidebar() {
  const { pathname } = useLocation();
  const path = useSurfacePath();

  return (
    <nav aria-label="Documentation" className="space-y-6">
      {DOC_CATEGORIES.map((category) => {
        const items = DOCS.filter((doc) => doc.category === category);
        if (!items.length) return null;
        return (
          <div key={category}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-secondary">
              {category}
            </p>
            <ul className="space-y-1 border-l border-border/60">
              {items.map((doc) => {
                const active = pathname === path(`/${doc.slug}`);
                return (
                  <li key={doc.slug}>
                    <SLink
                      to={`/${doc.slug}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors",
                        active
                          ? "border-brand-secondary font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                      )}
                    >
                      {doc.title}
                    </SLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function DocsHome() {
  return (
    <div className="page-shell section-block">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">
          Documentation
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          Everything you need to run Gradr
        </h1>
        <p className="mt-3 text-muted-foreground">
          Set up your workspace, understand how scoring works, master the AI Mock Interview, and
          manage your plan — with troubleshooting for when something misbehaves.
        </p>
      </header>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {DOC_CATEGORIES.map((category) => {
          const items = DOCS.filter((doc) => doc.category === category);
          if (!items.length) return null;
          return (
            <section key={category} className="rounded-xl border border-border/60 bg-card p-5 elev-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BookOpen className="h-4 w-4 text-brand-secondary" aria-hidden="true" />
                {category}
              </h2>
              <ul className="mt-3 space-y-2">
                {items.map((doc) => (
                  <li key={doc.slug}>
                    <SLink
                      to={`/${doc.slug}`}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {doc.title}
                    </SLink>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-12 rounded-xl border border-border/60 bg-card p-6 elev-1">
        <h2 className="text-lg font-semibold text-foreground">Ready to use it?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Documentation is best read with the product open next to it.
        </p>
        <CrossLink
          surface="app"
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Open Gradr
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </CrossLink>
      </div>
    </div>
  );
}

function DocArticleView({ doc }: { doc: DocArticle }) {
  return (
    <article className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">
        {doc.category}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{doc.title}</h1>
      <p className="mt-3 text-muted-foreground">{doc.description}</p>
      <div className="mt-8 space-y-8">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.list && (
              <ul className="mt-3 space-y-1.5">
                {section.list.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-secondary" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">Last updated {doc.updated}</p>
    </article>
  );
}

function DocRoute() {
  const { slug = "" } = useParams();
  const doc = DOCS_BY_SLUG[slug];
  if (!doc) return <Navigate to="/" replace />;
  return <DocArticleView doc={doc} />;
}

/** docs.gradr.me — public documentation. No app or admin routes are mounted. */
export default function DocsSurface() {
  return (
    <SurfaceShell
      eyebrow="Docs"
      nav={[
        { label: "Overview", to: "/" },
        { label: "Quickstart", to: "/quickstart" },
        { label: "AI Mock Interview", to: "/ai-mock-interview" },
        { label: "Billing", to: "/billing" },
        { label: "API", to: "/api" },
        { label: "FAQ", to: "/faq" },
      ]}
    >
      <Routes>
        <Route path="" element={<DocsHome />} />
        <Route
          path=":slug"
          element={
            <div className="page-shell section-block grid gap-10 lg:grid-cols-[16rem_1fr]">
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <DocsSidebar />
                </div>
              </aside>
              <DocRoute />
            </div>
          }
        />
        <Route path="*" element={<SurfaceNotFound label="Gradr Docs" />} />
      </Routes>
    </SurfaceShell>
  );
}
