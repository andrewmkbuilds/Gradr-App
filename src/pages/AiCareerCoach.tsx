import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Compass,
  GraduationCap,
  LineChart,
  ListChecks,
  Sparkles,
  Target,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { trackEvent, withUtm } from "@/lib/analytics";
import { track, trackSignupCta } from "@/lib/telemetry/events";
import {
  SITE_NAME,
  SITE_ORIGIN,
  absoluteUrl,
  buildBreadcrumbLd,
  buildFaqLd,
  buildHowToLd,
} from "@/lib/structuredData";

/**
 * Canonical path for the AI career coach landing page. Aliases such as
 * /career-coach and /ai-career-coaching redirect here so a single URL is
 * indexed — see CANONICAL_ALIASES in src/lib/seo/canonical.ts.
 */
export const AI_CAREER_COACH_PATH = "/ai-career-coach";

const UTM = {
  source: "ai_career_coach",
  medium: "landing",
  campaign: "ai_career_coach",
};

const ctaHref = (path: string, content: string) => withUtm(path, { ...UTM, content });

/**
 * Signup CTAs on this page emit both the page-scoped diagnostic event and the
 * canonical `signup_cta_clicked` funnel event, so clicks from
 * /ai-career-coach can be joined to `signup_completed` (which now carries the
 * first-touch `landing_page`) in one funnel.
 */
const trackSignupClick = (location: string, text: string) => () => {
  trackEvent("career_coach_cta_click", { location, destination: "/auth" });
  trackSignupCta({
    location: "landing_page",
    text,
    authenticated: false,
    destination: "/auth?mode=signup",
  });
};

const trackCta = (location: string, destination: string) => () =>
  trackEvent("career_coach_cta_click", { location, destination });


const STEPS = [
  {
    icon: Sparkles,
    name: "Give the coach your real material",
    text: "Upload a resume and set your target role, seniority, and location. The coach works from your actual experience rather than a questionnaire, so its advice references the roles, tools, and outcomes already on your record.",
  },
  {
    icon: Target,
    name: "Match against live roles",
    text: "Run your resume against the jobs you are actually considering. Each match returns a fit score with the requirements you meet, the ones you partially meet, and the ones missing entirely.",
  },
  {
    icon: LineChart,
    name: "See your ranked skill gaps",
    text: "Gradr aggregates every match into a ranked list of skill gaps — the requirements that appear most often across the roles you want but least often in your resume. Nothing is generic; it is computed from your own scores.",
  },
  {
    icon: ListChecks,
    name: "Work a plan, not a pep talk",
    text: "The coach turns those gaps into an ordered plan: which skills to close first, what proof to add to your resume, and which roles to apply for now versus after the next milestone.",
  },
];

const COMPARISON = [
  {
    area: "What the advice is based on",
    generic: "A generic chatbot answers from what it can infer from a prompt.",
    gradr:
      "Your parsed resume, your scored job matches, and the requirements of the specific roles you saved.",
  },
  {
    area: "Skill gap analysis",
    generic: "A list of skills that sound relevant to the job title.",
    gradr:
      "Requirements ranked by how often they appear across your matched roles and how weakly your resume evidences them.",
  },
  {
    area: "Follow-through",
    generic: "Advice ends when the conversation ends.",
    gradr:
      "Gaps become a career plan, tailored applications, tracked follow-ups, and interview practice inside the same account.",
  },
  {
    area: "Measuring progress",
    generic: "No baseline, so improvement is a feeling.",
    gradr:
      "Match scores and resume sub-scores are re-run after every edit, so you can see whether a change actually moved your fit.",
  },
];

const FAQS = [
  {
    question: "What is an AI career coach?",
    answer:
      "An AI career coach analyses your experience and your target roles, then tells you what to change to get hired — which skills are missing, how to present the ones you have, and what to do next. Gradr's coach grounds every recommendation in your uploaded resume and the live jobs you matched against, so the guidance is specific to your record rather than general career advice.",
  },
  {
    question: "How is an AI career coach different from a human career coach?",
    answer:
      "A human coach brings judgement, accountability, and industry relationships, and typically costs per hour. An AI career coach is available instantly, works through your full history and dozens of job descriptions in seconds, and can re-score your fit every time you change something. Many people use both: Gradr for the analysis and iteration, a human for the conversations that need a person.",
  },
  {
    question: "Is the Gradr AI career coach free?",
    answer:
      "Yes, a free Gradr account includes resume analysis, job matching, and your ranked skill gaps. Paid plans add unlimited matching, deeper career planning, tailored application generation, and unlimited voice mock interviews.",
  },
  {
    question: "How does the skill gap analysis work?",
    answer:
      "Gradr extracts the requirements from every role you match against, checks each one against the evidence in your resume, and ranks the results by how often a requirement appears across your target roles and how weakly you currently demonstrate it. The output is a short list of the gaps that block the most opportunities, not an exhaustive list of every skill in the market.",
  },
  {
    question: "Can the AI career coach help me change careers?",
    answer:
      "Yes. Match your current resume against roles in the field you want to move into, and the gap analysis shows which of your existing experience already transfers, which requirements are genuinely missing, and which adjacent roles are the shortest realistic bridge.",
  },
  {
    question: "Does the coach write my resume and applications too?",
    answer:
      "Gradr can rewrite resume sections against a specific job description and generate a tailored cover letter for each application, both grounded in your real experience. You review and edit everything before it is saved or sent.",
  },
  {
    question: "Is my career data private?",
    answer:
      "Your resumes, matches, plans, and sessions are tied to your account and are never shared with employers or other users. You can delete individual documents or export and permanently delete all of your data from your Gradr settings.",
  },
];

const PAGE_URL = absoluteUrl(AI_CAREER_COACH_PATH);

/**
 * SoftwareApplication describes the coach itself. Every property the Rich
 * Results Test warns about when omitted is supplied: an explicit @id so the
 * node can be referenced, a full Offer (url + availability + category), and a
 * publisher with a logo.
 */
const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${PAGE_URL}#software`,
  name: "Gradr AI Career Coach",
  url: PAGE_URL,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Career coaching",
  operatingSystem: "Web",
  browserRequirements: "Requires a modern web browser with JavaScript enabled.",
  description:
    "AI career coach that analyses your resume against live job matches, ranks your real skill gaps, and turns them into a step-by-step career plan.",
  featureList: [
    "Resume analysis with scored feedback",
    "Job matching with fit scores",
    "Ranked skill gap analysis",
    "Personalized career plan",
    "Tailored applications and cover letters",
    "AI mock interview practice",
  ],
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/gradr-logo-256.png` },
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    category: "Free plan",
    url: PAGE_URL,
  },
  inLanguage: "en",
};

export default function AiCareerCoach() {
  useEffect(() => {
    trackEvent("career_coach_page_view", { path: AI_CAREER_COACH_PATH });
    track("homepage_viewed", { page_kind: "landing", landing_page: AI_CAREER_COACH_PATH });
  }, []);

  return (
    <PublicShell source="ai_career_coach">
      <JsonLd
        nodes={[
          softwareLd,
          buildFaqLd(FAQS),
          buildHowToLd({
            name: "How to use the Gradr AI career coach",
            description:
              "Turn your resume and target roles into a ranked list of skill gaps and an ordered plan for closing them.",
            path: AI_CAREER_COACH_PATH,
            steps: STEPS.map((s) => ({ name: s.name, text: s.text })),
          }),
          buildBreadcrumbLd([
            { name: "Gradr", path: "/" },
            { name: "AI Career Coach", path: AI_CAREER_COACH_PATH },
          ]),
        ]}
        label="ai-career-coach"
      />

      <section className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Career guidance · Growth Engine
        </p>
        <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Free AI Career Coach
        </h1>
        <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
          An AI career coach that reads your actual resume, scores your fit against the jobs you
          want, ranks the skill gaps holding you back, and gives you the next concrete moves. Free
          to start, no credit card, no generic advice.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={ctaHref("/auth?mode=signup", "hero_primary")}
            onClick={trackSignupClick("hero_primary", "Get your free career analysis")}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            Get your free career analysis
          </Link>
          <Link
            to={ctaHref("/pricing", "hero_secondary")}
            onClick={trackCta("hero_secondary", "/pricing")}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            See plans and limits
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No credit card required · Works from your existing resume · Your data stays private to your account
        </p>
      </section>

      <section className="section-gap mx-auto max-w-3xl" aria-labelledby="what-is">
        <h2 id="what-is" className="text-2xl font-semibold tracking-tight text-foreground">
          What is an AI career coach?
        </h2>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          An AI career coach is software that analyses your experience and your target roles, then
          tells you what to change to get hired — which skills are missing, how to evidence the
          ones you already have, and what to do next. Unlike a chatbot, it works from your record
          rather than a prompt: Gradr parses your resume, scores it against live job descriptions,
          and re-measures your fit every time you change something.
        </p>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          It is a good fit if you are job hunting, changing careers, or unsure which roles you are
          genuinely competitive for today. It is not a replacement for a human coach when you need
          accountability, negotiation help, or industry introductions.
        </p>
      </section>



      <section className="section-gap" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight text-foreground">
          How the AI career coach works
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li
              key={step.name}
              className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="font-medium text-foreground">
                  <span className="text-muted-foreground">{i + 1}.</span> {step.name}
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section-gap" aria-labelledby="comparison">
        <h2
          id="comparison"
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"
        >
          <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
          Career advice from a chatbot versus from your own data
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The difference is not the model. It is whether the advice can see your resume, your
          matches, and the roles you are competing for.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">
              Comparison of generic AI career advice and Gradr's data-grounded career coaching
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Area</th>
                <th scope="col" className="py-2 pr-4 font-medium">Generic AI advice</th>
                <th scope="col" className="py-2 font-medium">Gradr AI career coach</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {COMPARISON.map((row) => (
                <tr key={row.area} className="border-b border-border/50 align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-foreground">
                    {row.area}
                  </th>
                  <td className="py-3 pr-4">{row.generic}</td>
                  <td className="py-3 text-foreground">{row.gradr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-gap" aria-labelledby="whats-included">
        <h2 id="whats-included" className="text-2xl font-semibold tracking-tight text-foreground">
          What your coaching account includes
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            {
              to: "/ats-resume-checker",
              label: "Resume analysis and ATS scoring",
              note: "Section-by-section scores and the exact keywords a parser cannot find.",
            },
            {
              to: "/job-application-tracker",
              label: "Job matching and pipeline tracking",
              note: "Fit scores per role, then one pipeline for every application and follow-up.",
            },
            {
              to: "/ai-cover-letter-generator",
              label: "Tailored applications",
              note: "Resume rewrites and cover letters grounded in your real experience.",
            },
            {
              to: "/ai-interview-coach",
              label: "Voice mock interviews",
              note: "Spoken practice for the exact role, with a scored report and transcript.",
            },
          ].map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={() =>
                  trackEvent("tool_card_click", {
                    source: "ai-career-coach",
                    destination: item.to,
                  })
                }
                className="group block h-full rounded-xl border border-border/70 p-4 transition-colors hover:border-primary/50"
              >
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  {item.label}
                  <ArrowRight
                    className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{item.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-gap" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight text-foreground">
          AI career coach FAQ
        </h2>
        <dl className="mt-6 divide-y divide-border/60">
          {FAQS.map((faq) => (
            <div key={faq.question} className="py-4">
              <dt className="font-medium text-foreground">{faq.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="section-gap rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Start with one resume and one target role
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          You get your fit score, your ranked skill gaps, and your first plan in a few minutes —
          free, and without a credit card.
        </p>
        <Link
          to={ctaHref("/auth?mode=signup", "footer_primary")}
          onClick={trackCta("footer_primary", "/auth")}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
        >
          Create a free account
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">
          Prefer to read first?{" "}
          <Link to="/career-advice" className="text-primary underline underline-offset-4">
            Browse the career advice guides
          </Link>
          .
        </p>
      </section>
    </PublicShell>
  );
}
