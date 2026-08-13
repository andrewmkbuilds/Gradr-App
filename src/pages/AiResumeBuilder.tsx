import { useEffect } from "react";
import { Link } from "@/lib/router-compat";
import {
  ArrowRight,
  Blocks,
  BriefcaseBusiness,
  FileText,
  Gauge,
  PenLine,
  Repeat2,
  Sparkles,
  Target,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { trackEvent, withUtm } from "@/lib/analytics";
import {
  buildBreadcrumbLd,
  buildFaqLd,
  buildHowToLd,
  buildSoftwareAppLd,
} from "@/lib/structuredData";

const PATH = "/ai-resume-builder";

const UTM = {
  source: "ai_resume_builder",
  medium: "landing",
  campaign: "ai_resume_builder",
};

const ctaHref = (path: string, content: string) => withUtm(path, { ...UTM, content });

const trackCta = (location: string, destination: string) => () =>
  trackEvent("resume_builder_cta_click", { location, destination });

const STEPS = [
  {
    icon: FileText,
    title: "Start from your real experience",
    body: "Upload an existing resume or answer a short guided prompt. Gradr extracts your roles, dates, tools, and outcomes into structured sections — nothing is invented, everything stays editable.",
  },
  {
    icon: Target,
    title: "Point it at a target role",
    body: "Paste a job description or pick a target title. The AI resume builder maps the posting's required skills against what your history already proves, and flags the honest gaps.",
  },
  {
    icon: PenLine,
    title: "Rewrite bullets with impact",
    body: "Each weak line gets a suggested rewrite in the posting's own language: action verb, scope, measurable result. Accept, edit, or reject them one by one.",
  },
  {
    icon: Gauge,
    title: "Score, export, and iterate",
    body: "Run an ATS check before you export. Download a single-column PDF or DOCX that parses cleanly, then keep versions per role so tailoring takes minutes instead of an evening.",
  },
];

const FEATURES = [
  {
    icon: Blocks,
    title: "ATS-safe formatting by default",
    body: "One column, standard section headings, selectable text, no tables or text-in-image. The layout is designed around what parsers can actually read.",
  },
  {
    icon: Repeat2,
    title: "Versions per application",
    body: "Keep a master resume and per-role variants. Compare two versions line by line to see exactly what changed and which version scored better.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Wired into the rest of your search",
    body: "The resume you build feeds job matching, tailored applications, and interview prep — so the same profile powers every step instead of living in a separate document.",
  },
];

const FAQS = [
  {
    question: "What is an AI resume builder?",
    answer:
      "An AI resume builder turns your real work history into a structured, ATS-readable resume and suggests stronger wording for each bullet point. Gradr's builder extracts your experience, compares it against a target job description, and rewrites weak lines using the posting's own terminology — while keeping every claim grounded in what you actually did.",
  },
  {
    question: "Is the Gradr AI resume builder free to use?",
    answer:
      "Yes. A free Gradr account lets you build a resume, run ATS checks, and export a clean PDF or DOCX. Paid plans add unlimited AI rewrites, unlimited resume versions, job matching across live postings, and AI mock interviews with scored feedback.",
  },
  {
    question: "Will a resume written with AI pass an ATS?",
    answer:
      "It will if the structure is right. Applicant Tracking Systems fail on multi-column layouts, header/footer contact details, non-standard section names, and scanned files — not on AI wording. Gradr builds in a single-column, standard-heading layout and scores the finished document with the ATS resume checker before you export it.",
  },
  {
    question: "Does the AI make up experience I do not have?",
    answer:
      "No. Suggestions are constrained to the roles, tools, and outcomes you provide, and every rewrite is shown as a proposal you can accept or reject. Missing requirements are reported as gaps to address honestly rather than being fabricated into your history.",
  },
  {
    question: "How is the resume builder different from the ATS resume checker?",
    answer:
      "The builder creates and rewrites the document; the ATS resume checker grades an existing file against one specific posting and lists the missing keywords. Most people use both: build the master resume once, then run the checker for every application to tailor it before submitting.",
  },
  {
    question: "Which file format should I export?",
    answer:
      "Export a single-column PDF for most online applications, and DOCX when an employer or recruiter explicitly asks for an editable file. Both Gradr exports keep selectable text, standard headings, and contact details inside the document body so parsers capture them correctly.",
  },
];

export default function AiResumeBuilder() {
  useEffect(() => {
    trackEvent("resume_builder_page_view", { path: PATH });
  }, []);

  return (
    <PublicShell source="ai_resume_builder">
      <JsonLd
        nodes={[
          buildSoftwareAppLd({
            name: "Gradr AI Resume Builder",
            path: PATH,
            description:
              "Free AI resume builder that turns your real experience into an ATS-ready resume, rewrites weak bullet points against a target job description, and exports clean PDF or DOCX files.",
          }),
          buildHowToLd({
            name: "How to build an ATS-ready resume with AI",
            description:
              "Four steps to go from an existing resume or a blank page to a tailored, ATS-readable resume for a specific job posting.",
            path: PATH,
            totalTime: "PT15M",
            steps: STEPS.map((s) => ({ name: s.title, text: s.body })),
          }),
          buildFaqLd(FAQS),
          buildBreadcrumbLd([
            { name: "Gradr", path: "/" },
            { name: "AI Resume Builder", path: PATH },
          ]),
        ]}
        label="ai-resume-builder"
      />

      <section className="mx-auto max-w-3xl text-center">
        <p className="accent-text text-xs font-semibold uppercase tracking-wider">
          Free tool · Resume Intelligence
        </p>
        <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          AI Resume Builder
        </h1>
        <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
          Build a resume that a parser can read and a recruiter wants to finish. Gradr
          structures your real experience, rewrites the weak lines against the job you're
          actually applying for, and scores the result before you export it.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={ctaHref("/auth?mode=signup", "hero_primary")}
            onClick={trackCta("hero_primary", "/auth")}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Build my resume free
          </Link>
          <Link
            to={ctaHref("/ats-resume-checker", "hero_secondary")}
            onClick={trackCta("hero_secondary", "/ats-resume-checker")}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Check an existing resume
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No credit card required · PDF and DOCX export · Your resume stays private to your account
        </p>
      </section>

      <section className="mt-16" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight text-foreground">
          How the AI resume builder works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              id={`step-${i + 1}`}
              className="rounded-xl border border-border/70 bg-card/60 p-5"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                  <step.icon className="h-4 w-4 text-accent" aria-hidden="true" />
                </span>
                <p className="font-medium text-foreground">
                  {i + 1}. {step.title}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16" aria-labelledby="features">
        <h2 id="features" className="text-2xl font-semibold tracking-tight text-foreground">
          What makes a Gradr resume different
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border/70 p-5">
              <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-3 font-medium text-foreground">{feature.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="mt-16 rounded-2xl border border-accent/30 bg-accent/5 p-8"
        aria-labelledby="pair-with-checker"
      >
        <h2
          id="pair-with-checker"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          Pair the builder with the ATS resume checker
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Building the document is half the job. Before every submission, run the finished
          resume through the free{" "}
          <Link
            to={ctaHref("/ats-resume-checker", "body_link")}
            onClick={trackCta("body_link", "/ats-resume-checker")}
            className="font-medium text-accent underline underline-offset-4"
          >
            ATS resume checker
          </Link>{" "}
          to score it against that specific posting, catch formatting a parser can't read, and
          see the exact keywords you're still missing.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={ctaHref("/ats-resume-checker", "pair_primary")}
            onClick={trackCta("pair_primary", "/ats-resume-checker")}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Run a free ATS check
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to={ctaHref("/blog/ai-resume-optimization", "pair_secondary")}
            onClick={trackCta("pair_secondary", "/blog/ai-resume-optimization")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Read the AI resume optimization guide
          </Link>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight text-foreground">
          AI resume builder FAQ
        </h2>
        <dl className="mt-6 divide-y divide-border/70 border-y border-border/70">
          {FAQS.map((faq) => (
            <div key={faq.question} className="py-5">
              <dt className="font-medium text-foreground">{faq.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16" aria-labelledby="keep-reading">
        <h2 id="keep-reading" className="text-2xl font-semibold tracking-tight text-foreground">
          Keep reading
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              to: "/ats-resume-checker",
              title: "ATS Resume Checker",
              desc: "Score a finished resume against one job description and get the missing keywords.",
              location: "related_ats",
            },
            {
              to: "/ai-interview-coach",
              title: "AI Interview Coach",
              desc: "Practise realtime mock interviews built from the same job description.",
              location: "related_interview",
            },
            {
              to: "/career-advice",
              title: "Career Advice Guides",
              desc: "Free guides on resumes, cover letters, and interview preparation.",
              location: "related_advice",
            },
          ].map((item) => (
            <Link
              key={item.to}
              to={ctaHref(item.to, item.location)}
              onClick={trackCta(item.location, item.to)}
              className="rounded-xl border border-border/70 p-5 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section
        className="mt-16 rounded-2xl border border-primary/25 bg-primary/5 p-8 text-center"
        aria-labelledby="builder-cta"
      >
        <h2 id="builder-cta" className="text-2xl font-semibold tracking-tight text-foreground">
          Build it once, tailor it in minutes
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Create your master resume, then let Gradr adapt it for every role you apply to.
          Free to start — no credit card.
        </p>
        <Link
          to={ctaHref("/auth?mode=signup", "footer_cta")}
          onClick={trackCta("footer_cta", "/auth")}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
        >
          Start building free
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </PublicShell>
  );
}
