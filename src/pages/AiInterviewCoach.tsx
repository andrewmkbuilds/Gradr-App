import { useEffect } from "react";
import { Link } from "@/lib/router-compat";
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Mic,
  MessageSquareText,
  Sparkles,
  Timer,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { trackEvent, withUtm } from "@/lib/analytics";
import {
  SITE_NAME,
  SITE_ORIGIN,
  absoluteUrl,
  buildBreadcrumbLd,
  buildFaqLd,
  buildHowToLd,
} from "@/lib/structuredData";

const PATH = "/ai-interview-coach";

const UTM = {
  source: "ai_interview_coach",
  medium: "landing",
  campaign: "ai_interview_coach",
};

const ctaHref = (path: string, content: string) => withUtm(path, { ...UTM, content });

const trackCta = (location: string, destination: string) => () =>
  trackEvent("interview_coach_cta_click", { location, destination });

const STEPS = [
  {
    icon: MessageSquareText,
    title: "Pick the role you're interviewing for",
    body: "Paste the job description or choose a saved target role. The coach builds a question set from the actual requirements — not a generic list of the same ten questions.",
  },
  {
    icon: Mic,
    title: "Talk through a live mock interview",
    body: "A realtime voice interviewer asks, listens, and follows up when your answer is thin. You can interrupt it mid-sentence, exactly like a real conversation.",
  },
  {
    icon: Brain,
    title: "Get scored on substance, not vibes",
    body: "Every answer is assessed on structure, specificity, relevance to the role, and evidence. Filler, rambling, and unsupported claims are called out with the timestamp.",
  },
  {
    icon: BarChart3,
    title: "Leave with a practice plan",
    body: "A scorecard you can export as a PDF, plus a prioritised follow-up plan telling you which stories to rebuild before the real interview.",
  },
];

const FORMATS = [
  {
    title: "Behavioural interviews",
    body: "STAR-structured questions drawn from the competencies in the posting, with follow-ups that probe for the outcome you skipped.",
  },
  {
    title: "Role-specific technical screens",
    body: "Conceptual and scenario questions matched to the tools and seniority the job actually lists, from first-round screens to hiring-manager depth.",
  },
  {
    title: "Case and problem-solving rounds",
    body: "Open-ended prompts where the coach evaluates how you structure the problem out loud, not just the answer you land on.",
  },
  {
    title: "Recruiter and screening calls",
    body: "The first-call basics that sink candidates: your positioning, salary conversation, notice period, and why this role.",
  },
  {
    title: "Final-round and executive panels",
    body: "Higher-pressure questioning on judgement, trade-offs, and leadership, with less patience for vague answers.",
  },
  {
    title: "Career-change and gap questions",
    body: "Targeted practice on the questions candidates dread — career breaks, pivots, layoffs — framed honestly rather than dodged.",
  },
];

const FEEDBACK = [
  { label: "Structure", meaning: "Whether your answer has a setup, an action, and a measurable result." },
  { label: "Specificity", meaning: "Real numbers, systems, and decisions instead of generic responsibility statements." },
  { label: "Relevance", meaning: "How closely the example maps to what this posting is hiring for." },
  { label: "Delivery", meaning: "Pace, filler words, and answer length against the time a panel will give you." },
];

const FAQS = [
  {
    question: "What is an AI interview coach?",
    answer:
      "An AI interview coach runs realistic mock interviews, listens to your spoken answers, asks follow-up questions, and scores each response against the role you are targeting. Gradr's coach combines a realtime voice interviewer with a written scorecard so you can practise as often as you need without booking a human coach.",
  },
  {
    question: "Is the Gradr AI mock interview free?",
    answer:
      "You can create a free Gradr account and run a mock interview with scoring and written feedback. Paid plans unlock longer sessions, unlimited interviews, premium realtime voice, full transcripts, and PDF scorecards.",
  },
  {
    question: "Does it work for technical interviews?",
    answer:
      "Yes. Question sets are generated from the job description, so a backend engineering posting produces system and language questions, while a marketing role produces campaign and metrics questions. It is designed for spoken screens and hiring-manager rounds rather than live coding editors.",
  },
  {
    question: "Do I need a microphone or camera?",
    answer:
      "A microphone is required for the voice mock interview. A camera is optional and only used locally for presence feedback — nothing is recorded to your account unless you choose to save the session.",
  },
  {
    question: "How is the interview feedback generated?",
    answer:
      "Each answer is transcribed and assessed on structure, specificity, relevance to the posting, and delivery. Feedback quotes your own words back with the timestamp, so every suggestion points to a line you actually said.",
  },
  {
    question: "How many mock interviews should I do before a real one?",
    answer:
      "Most candidates see the biggest jump after three to five sessions on the same role: the first exposes weak stories, the next few rebuild them. Gradr tracks readiness across sessions so you can see when your scores stop improving and it is time to apply.",
  },
];

const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Gradr AI Interview Coach",
  url: absoluteUrl(PATH),
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI interview coach that runs realtime voice mock interviews tailored to a job description, then scores each answer and returns a practice plan.",
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  inLanguage: "en",
};

/**
 * The scorecard table is the page's most-quoted answer block, so it also ships
 * as an ItemList of DefinedTerms. Rich Results validates this cleanly (a bare
 * schema.org Table has no supported rich result) and it gives AI answer
 * engines an unambiguous list of the four scoring dimensions.
 */
const scoringLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Gradr AI mock interview scoring dimensions",
  description: "The four dimensions every answer in a Gradr AI mock interview is scored against.",
  itemListOrder: "https://schema.org/ItemListUnordered",
  numberOfItems: FEEDBACK.length,
  itemListElement: FEEDBACK.map((row, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "DefinedTerm",
      name: row.label,
      description: row.meaning,
      inDefinedTermSet: {
        "@type": "DefinedTermSet",
        name: "Gradr interview scorecard",
        url: absoluteUrl(`${PATH}#feedback`),
      },
    },
  })),
};

export default function AiInterviewCoach() {
  useEffect(() => {
    trackEvent("interview_coach_page_view", { path: PATH });
  }, []);

  return (
    <PublicShell source="ai_interview_coach">
      <JsonLd
        nodes={[
          softwareLd,
          scoringLd,
          buildHowToLd({
            name: "How to practise for an interview with an AI coach",
            description:
              "Four steps to run a realtime AI mock interview built from a real job description and leave with a scored practice plan.",
            path: PATH,
            totalTime: "PT30M",
            steps: STEPS.map((s) => ({ name: s.title, text: s.body })),
          }),
          buildFaqLd(FAQS),
          buildBreadcrumbLd([
            { name: "Gradr", path: "/" },
            { name: "AI Interview Coach", path: PATH },
          ]),
        ]}
        label="ai-interview-coach"
      />

      <section className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Free to start · Interview Intelligence
        </p>
        <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          AI Interview Coach
        </h1>
        <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
          Run a realtime AI mock interview for the exact job you're applying to. Speak your
          answers, get interrupted with real follow-ups, and leave with a scorecard that shows
          precisely which stories to fix before the interview that counts.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={ctaHref("/auth?mode=signup", "hero_primary")}
            onClick={trackCta("hero_primary", "/auth")}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Start a free mock interview
          </Link>
          <Link
            to={ctaHref("/career-advice", "hero_secondary")}
            onClick={trackCta("hero_secondary", "/career-advice")}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Read the interview prep guides
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No credit card required · Voice or text · Sessions stay private to your account
        </p>
      </section>

      <section className="mt-16" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight text-foreground">
          How the AI mock interview works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-sm transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center extrude rounded-lg bg-primary/10 text-primary">
                  <step.icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <h3 className="font-medium text-foreground">
                  <span className="text-muted-foreground">{i + 1}.</span> {step.title}
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16" aria-labelledby="formats">
        <h2 id="formats" className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
          Interview formats you can practise
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every session is built from the posting you're targeting, so the questions match the
          round you're actually about to sit.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {FORMATS.map((format) => (
            <div key={format.title} className="rounded-xl border border-border/70 p-5">
              <h3 className="flex items-start gap-2 font-medium text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {format.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{format.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16" aria-labelledby="feedback">
        <h2 id="feedback" className="text-2xl font-semibold tracking-tight text-foreground">
          What your interview scorecard measures
        </h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">Scoring dimensions used in the Gradr AI mock interview</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Dimension</th>
                <th scope="col" className="py-2 font-medium">What it checks</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {FEEDBACK.map((row) => (
                <tr key={row.label} className="border-b border-border/50">
                  <th scope="row" className="py-3 pr-4 text-left font-medium text-foreground">
                    {row.label}
                  </th>
                  <td className="py-3">{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight text-foreground">
          AI interview coach FAQ
        </h2>
        <dl className="mt-6 space-y-5">
          {FAQS.map((faq) => (
            <div key={faq.question} className="rounded-xl border border-border/70 p-5">
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
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            {
              to: "/ats-resume-checker",
              title: "ATS Resume Checker",
              desc: "Score your resume against the posting before you practise interviewing for it.",
              location: "related_ats",
            },
            {
              to: "/blog/ai-resume-optimization",
              title: "AI Resume Builder & ATS Guide",
              desc: "How parsing, scoring, and AI rewrites decide whether you reach the interview at all.",
              location: "related_blog",
            },
            {
              to: "/job-search",
              title: "Job Search by Role & Location",
              desc: "See what each role asks for, then practise the interview it leads to.",
              location: "related_job_search",
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

      <section className="mt-16 rounded-2xl border border-primary/25 bg-primary/5 p-8 text-center" aria-labelledby="practise-cta">
        <h2 id="practise-cta" className="text-2xl font-semibold tracking-tight text-foreground">
          Practise before it counts
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pick a role, run a realtime mock interview, and get your scorecard in minutes.
          Free to start — no credit card.
        </p>
        <Link
          to={ctaHref("/auth?mode=signup", "footer_cta")}
          onClick={trackCta("footer_cta", "/auth")}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] motion-reduce:transform-none"
        >
          Start my free mock interview
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </PublicShell>
  );
}
