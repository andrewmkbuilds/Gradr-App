import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  ArrowRight, Check, FileText, Target, Mic, LineChart, Briefcase, Users,
  GraduationCap, Rocket, Compass, Award, Sparkles, ShieldCheck,
  Layers, Bot, Search, Send, RefreshCw, BarChart3, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { Reveal } from "@/components/landing/Reveal";
import { SiteNav } from "@/components/landing/SiteNav";
import { HeroFlow } from "@/components/landing/HeroFlow";
import { Aurora, DotGrid, GridScan, Grainient, SoftAurora, Threads, ChapterRule } from "@/components/backgrounds";
import {
  AnimatedHeadline,
  MotionPressable,
  Magnetic,
  CountUp,
  SpotlightCard,
  MaskedHeading,
  BlurText,
  GradientText,
  ShinyText,
  MagicBento,
  GlareCard,
  HoverLift,
  AnimatedList,
} from "@/components/motion";
import { ConceptLoop, GlowFrame, Glare } from "@/components/reactbits";
import { ProductDemos } from "@/components/landing/ProductDemos";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import {
  ResumeVisual, MatchVisual, ApplicationVisual,
  InterviewVisual, AssistantVisual, AnalyticsVisual,
} from "@/components/landing/visuals";

/* ---------------------------------- data ---------------------------------- */

const NAV = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "AI Interview", href: "#interview" },
  { label: "Pricing", href: "#pricing" },
  { label: "For Students", href: "#students" },
  { label: "For Professionals", href: "#professionals" },
];

const FRAGMENTS = [
  "Resume builders", "Job boards", "Spreadsheets", "Interview prep tools",
  "LinkedIn", "Scattered notes", "AI chatbots", "Email threads", "Calendars",
];

const SYSTEM = [
  { n: "01", title: "Resume Intelligence", copy: "Parse your resume and score what recruiters and parsers actually read.", icon: FileText },
  { n: "02", title: "ATS Optimization", copy: "Fix keywords, structure, and impact language before you apply.", icon: ShieldCheck },
  { n: "03", title: "Job Matching", copy: "Score live roles against your real skills, not a keyword blob.", icon: Target },
  { n: "04", title: "Application Strategy", copy: "Turn one job description into a complete application package.", icon: Send },
  { n: "05", title: "Networking", copy: "Draft outreach that references the role and the company, not a template.", icon: Users },
  { n: "06", title: "AI Mock Interview", copy: "Hold a real spoken interview with an adaptive AI interviewer.", icon: Mic },
  { n: "07", title: "Career Analytics", copy: "See what's improving — and what's blocking your pipeline.", icon: BarChart3 },
  { n: "08", title: "Continuous Improvement", copy: "Every session feeds the next practice plan and resume pass.", icon: RefreshCw },
];

const AUDIENCE = [
  { icon: GraduationCap, title: "Students", copy: "Build your first serious career profile before recruiting season starts.", id: "students" },
  { icon: Award, title: "New graduates", copy: "Move from graduation to your first offer with a system, not a spreadsheet." },
  { icon: Compass, title: "Career changers", copy: "Translate the experience you already have into the language of a new field." },
  { icon: Rocket, title: "Early-career professionals", copy: "Sharpen your positioning and stop losing offers at the interview stage.", id: "professionals" },
  { icon: Briefcase, title: "Experienced professionals", copy: "Make deliberate moves: target better roles and prepare for harder rooms." },
];

const HOW = [
  "Build your profile",
  "Upload your resume",
  "Set your career goals",
  "Find matching opportunities",
  "Prepare your applications",
  "Practice interviews",
  "Improve continuously",
];

const OLD_WAY = [
  "A resume you edit blind",
  "Five job boards, no signal",
  "A spreadsheet you stop updating",
  "Interview prep from a blog post",
  "A chatbot with no memory of you",
];

const NEW_WAY = [
  "A resume scored against real roles",
  "Matches ranked by actual fit",
  "A pipeline that updates as you apply",
  "Spoken interviews with a scored report",
  "One system that remembers your history",
];

const PLANS = [
  {
    name: "Free",
    tagline: "Enough to feel the whole system.",
    monthly: { price: "$0", note: "forever" },
    annual: { price: "$0", note: "forever" },
    features: [
      "Resume upload and ATS scoring",
      "Job discovery and matching",
      "Application tracking",
      "Guided AI interview preview",
      "Basic career analytics",
    ],
    cta: "Get started free",
  },
  {
    name: "Starter",
    tagline: "For an active job search.",
    monthly: { price: "$9", note: "per month" },
    annual: { price: "$84", note: "per year · save $24" },
    features: [
      "Everything in Free",
      "Expanded resume and ATS passes",
      "Full AI mock interview sessions",
      "Application packages and outreach drafts",
      "Selected interviewer personas",
      "Interview reports and transcripts",
    ],
    cta: "Start with Starter",
  },
  {
    name: "Pro",
    tagline: "The complete Gradr experience.",
    monthly: { price: "$19", note: "per month" },
    annual: { price: "$168", note: "per year · $14/month" },
    highlight: true,
    features: [
      "Everything in Starter",
      "Unlimited live interview sessions",
      "Company and role-specific simulations",
      "Advanced personas and difficulty control",
      "Deep transcript analysis and coaching plans",
      "Long-term analytics and readiness tracking",
      "PDF exports and mentor sharing",
    ],
    cta: "Go Pro",
  },
];

const FAQS: [string, string][] = [
  ["What is Gradr?", "Gradr is an AI career operating system. It connects resume intelligence, ATS optimization, job matching, application generation, networking outreach, AI mock interviews, and career analytics in a single workspace — so each step feeds the next instead of living in a different tool."],
  ["Who is Gradr for?", "People actively moving toward a job: students preparing for recruiting, new graduates chasing a first offer, career changers repositioning existing experience, and early-career or experienced professionals who want a more deliberate search."],
  ["Can I use Gradr for free?", "Yes. The Free plan includes resume upload with ATS scoring, job matching, application tracking, and a guided preview of the AI Mock Interview. No card required to start."],
  ["What does Pro include?", "Unlimited live interview sessions, company and role-specific simulations, advanced interviewer personas and difficulty control, deep transcript analysis, personalized practice plans, long-term analytics, and PDF exports you can share with a mentor."],
  ["Does Gradr analyze my resume?", "It parses your PDF or DOCX, extracts the real text a parser would see, and scores ATS compatibility, keyword coverage, impact language, and structure — then gives specific line-level changes rather than generic advice."],
  ["How does the AI Mock Interview work?", "You pick a role, seniority, and difficulty, optionally attaching a job description. The interviewer speaks with you in real time, asks follow-ups based on what you actually said, and produces a scored report with a transcript and a recommended practice plan afterwards."],
  ["Does Gradr store interview recordings?", "No. Raw video is never uploaded — camera analysis for framing and attention runs on your device. Transcripts and scores are saved to your account so you can track progress, and you can delete any session at any time."],
  ["How does Gradr protect my data?", "Your data is scoped to your account with row-level access rules in the database. Resume files live in a private bucket only you can read. Interview keys never reach the browser — realtime sessions use short-lived tokens minted by our backend."],
  ["Can I cancel?", "Yes. Upgrade, downgrade, or cancel any time from the billing portal in your account. Cancelling keeps access until the end of the period you already paid for."],
];

const FOOTER = [
  {
    title: "Product",
    links: [
      ["Resume Intelligence", "#resume"],
      ["Job Matching", "#matching"],
      ["Applications", "#applications"],
      ["AI Interview", "#interview"],
      ["Career Assistant", "#assistant"],
      ["Pricing", "#pricing"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "#product"],
      ["Contact", "mailto:hello@gradr.me"],
      ["Careers", "#product"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help Center", "#faq"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Refund Policy", "/refund-policy"],
      ["Cookie Policy", "/cookie-policy"],
      ["DPA", "/dpa"],
    ],
  },
];

/* ------------------------------- primitives -------------------------------- */

function Section({
  id, className = "", children,
}: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`relative w-full scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28 ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
      <span className="h-px w-6 bg-primary/50" aria-hidden />
      {children}
    </span>
  );
}

function Heading({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`font-display text-balance text-3xl font-bold leading-[1.06] tracking-[-0.03em] sm:text-4xl lg:text-[2.9rem] ${className}`}>
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{children}</p>;
}

/* ---------------------------------- page ----------------------------------- */

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, -48]);
  const heroParallax = !reduceMotion;

  const start = () => navigate(user ? "/" : "/auth");
  const login = () => navigate(user ? "/" : "/auth");

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">


      <a
        href="#hero"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <SiteNav
        items={NAV}
        authed={!!user}
        onStart={start}
        onLogin={login}
        onOpenApp={() => navigate("/")}
      />

      <main id="hero">
        <div className="grain relative overflow-hidden pt-32 sm:pt-36">
          <Aurora />
          <DotGrid intensity={0.9} />

          <Section className="!pb-0 !pt-0">
            <div className="grid items-center gap-12 lg:grid-cols-[1.04fr_1fr] lg:gap-16">
              <div className="space-y-7">
                <BlurText>
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    <ShinyText>AI career operating system</ShinyText>
                  </span>
                </BlurText>

                <h1 className="display-xl text-balance text-foreground">
                  <MaskedHeading as="span" text="Your career," className="block" immediate />
                  <span className="block overflow-hidden">
                    <motion.span
                      className="inline-block"
                      initial={reduceMotion ? false : { y: "110%" }}
                      animate={{ y: "0%" }}
                      transition={{ delay: 0.22, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <GradientText>run like a system.</GradientText>
                    </motion.span>
                  </span>
                </h1>

                <BlurText delay={0.15}>
                  <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Gradr reads your resume the way an ATS does, scores live roles against your real profile,
                    runs spoken mock interviews, and turns all of it into the next move.{" "}
                    <span className="text-foreground">One workspace. One continuous loop.</span>
                  </p>
                </BlurText>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Magnetic>
                    <MotionPressable>
                      <Button size="lg" className="group h-12 w-full px-7 text-base sm:w-auto" onClick={start}>
                        Get started free
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                      </Button>
                    </MotionPressable>
                  </Magnetic>
                  <Magnetic strength={0.18}>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 px-6 text-base"
                      onClick={() => document.getElementById("demos")?.scrollIntoView({ behavior: "smooth" })}
                    >
                      See it working
                    </Button>
                  </Magnetic>
                </div>

                <dl className="grid max-w-lg grid-cols-3 gap-4 border-t border-border/60 pt-6">
                  {[
                    { v: 86, suffix: "", label: "Avg. ATS score after rewrite" },
                    { v: 4.2, suffix: "x", label: "More interview invites", decimals: 1 },
                    { v: 12, suffix: "min", label: "To a full application pack" },
                  ].map((s2) => (
                    <div key={s2.label}>
                      <dd className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                        <CountUp value={s2.v} decimals={s2.decimals ?? 0} suffix={s2.suffix} />
                      </dd>
                      <dt className="mt-1 text-[11px] leading-snug text-muted-foreground">{s2.label}</dt>
                    </div>
                  ))}
                </dl>

                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="uppercase tracking-[0.18em]">Now running</span>
                  <span aria-hidden className="h-1 w-1 rounded-full bg-primary/70" />
                  <ConceptLoop
                    className="font-medium text-primary"
                    items={[
                      "Resume Intelligence",
                      "ATS Optimization",
                      "Job Matching",
                      "Interview Coaching",
                      "Career Intelligence",
                    ]}
                  />
                </p>
              </div>

              <motion.div className="lg:pl-4" style={heroParallax ? { y: heroY } : undefined}>
                <Reveal delay={120}>
                  <HeroFlow />
                </Reveal>
              </motion.div>
            </div>
          </Section>

          <div className="mx-auto mt-14 max-w-6xl px-5 sm:px-8">
            <ChapterRule />
          </div>
        </div>

        {/* ------------------------------- problem ------------------------------ */}
        <Section id="product" className="border-t border-border/60">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
            <Reveal className="space-y-5">
              <Eyebrow>The problem</Eyebrow>
              <Heading>Job searching is fragmented.</Heading>
              <Lede>
                Your resume lives in one tool, your applications in a spreadsheet, your interview prep in a browser tab,
                and your decisions in your head. Nothing knows what anything else learned about you.
              </Lede>
            </Reveal>

            <Reveal delay={100} className="space-y-6">
              <ul className="flex flex-wrap gap-2">
                {FRAGMENTS.map((f) => (
                  <li
                    key={f}
                    className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
                  >
                    {f}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Gradr brings it together</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-4">
                <Layers className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <p className="text-sm leading-relaxed text-foreground">
                  One profile. One resume model. One pipeline. Every module reads the same context about you.
                </p>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ---------------------------- the gradr system ------------------------ */}
        <Section className="relative border-t border-border/60">
          <GridScan intensity={0.9} />
          <div className="max-w-3xl space-y-5">
            <Eyebrow>The Gradr system</Eyebrow>
            <MaskedHeading
              text="Eight modules. One continuous loop."
              className="font-display text-balance text-3xl font-bold leading-[1.06] tracking-[-0.03em] sm:text-4xl lg:text-[2.9rem]"
            />
            <BlurText delay={0.1}>
              <Lede>
                Gradr doesn't treat each career task as a separate tool. Your resume informs your matches, your matches
                shape your applications, your applications set up your interviews, and every interview improves the next pass.
              </Lede>
            </BlurText>
          </div>

          <MagicBento
            className="mt-12 lg:grid-cols-4"
            items={SYSTEM.map((m) => ({
              title: m.title,
              copy: m.copy,
              icon: <m.icon className="h-5 w-5" aria-hidden />,
              footer: <span className="numeric text-[11px] font-semibold tracking-widest text-primary">{m.n}</span>,
            }))}
          />
        </Section>

        {/* ------------------------- interactive product demos ------------------- */}
        <Section id="demos" className="grain relative border-t border-border/60">
          <div className="pointer-events-none absolute inset-0 -z-10 atmos opacity-60" aria-hidden />
          <Reveal className="max-w-3xl space-y-5">
            <Eyebrow>See it working</Eyebrow>
            <Heading className="display-lg">Not screenshots. The product, running.</Heading>
            <Lede>
              Four live surfaces from inside Gradr. Switch between them and watch the same profile move through
              analysis, matching, interview practice, and career planning.
            </Lede>
          </Reveal>
          <div className="mt-12">
            <ProductDemos />
          </div>
        </Section>

        {/* --------------------------- resume intelligence ---------------------- */}
        <Section id="resume" className="border-t border-border/60">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="space-y-5">
              <Eyebrow>01 — Resume intelligence</Eyebrow>
              <Heading>Know exactly what your resume is doing wrong.</Heading>
              <Lede>
                Upload a PDF or DOCX. Gradr reads the text a parser actually extracts — not what the layout looks like —
                then scores it and tells you which lines to change.
              </Lede>
              <ul className="grid gap-2 sm:grid-cols-2">
                {["ATS compatibility", "Keyword coverage", "Impact language", "Structure", "Clarity", "Role alignment"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="h-11" onClick={start}>
                Optimize my resume
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </Reveal>
            <Reveal delay={100}><ResumeVisual /></Reveal>
          </div>
        </Section>

        {/* ------------------------------ job matching -------------------------- */}
        <Section id="matching" className="border-t border-border/60 bg-card/30">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal delay={100} className="lg:order-2 lg:pl-4">
              <MatchVisual />
            </Reveal>
            <Reveal className="space-y-5 lg:order-1">
              <Eyebrow>02 — Job matching</Eyebrow>
              <Heading>Stop applying everywhere. Apply where you actually fit.</Heading>
              <Lede>
                Gradr scores live listings against your resume and goals, and shows you the skills you already match
                alongside the ones you're missing — before you spend an hour on the application.
              </Lede>
              <ul className="grid gap-2 sm:grid-cols-2">
                {["Match score", "Matched skills", "Missing skills", "Salary where listed", "Location and work mode", "Role alignment"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Button size="lg" variant="outline" className="h-11" onClick={start}>
                <Search className="mr-2 h-4 w-4" aria-hidden />
                Find my matches
              </Button>
            </Reveal>
          </div>
        </Section>

        {/* --------------------------- application engine ----------------------- */}
        <Section id="applications" className="border-t border-border/60">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="space-y-5">
              <Eyebrow>03 — Application engine</Eyebrow>
              <Heading>One job description in. A full application out.</Heading>
              <Lede>
                Paste a link or a description. Gradr produces tailored resume bullets, a cover letter written for that
                specific role, a short recruiter message, and a tracked entry in your pipeline.
              </Lede>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Everything stays editable. Gradr drafts the first version so you spend your time on judgment, not
                formatting.
              </p>
              <Button size="lg" className="h-11" onClick={start}>
                Build an application
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </Reveal>
            <Reveal delay={100}><ApplicationVisual /></Reveal>
          </div>
        </Section>

        {/* -------------------------- flagship: interview ----------------------- */}
        <Section id="interview" className="relative border-t border-border/60 bg-card/40">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/[0.07] to-transparent" aria-hidden />
          <Reveal className="max-w-3xl space-y-5">
            <Eyebrow>Flagship — AI mock interview</Eyebrow>
            <Heading>Practice the interview before the interview.</Heading>
            <Lede>
              A spoken, real-time interview with an AI interviewer that listens, interrupts naturally, and asks follow-ups
              based on what you actually said. Not a chatbot with a question list.
            </Lede>
          </Reveal>

          <Reveal delay={100} className="mt-10"><InterviewVisual /></Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Bot, title: "Adaptive interviewer", copy: "The session adapts to role, company, industry, seniority, difficulty, and how you're performing in the moment." },
              { icon: Mic, title: "Real conversation", copy: "Speak naturally, interrupt mid-question, and get a contextual follow-up instead of a scripted next prompt." },
              { icon: LineChart, title: "Scored report", copy: "Every session ends with strengths, specific improvements, a full transcript, and the questions to practice next." },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 60} className="bg-card p-6">
                <f.icon className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-sm font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.copy}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={80} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-12 px-6" onClick={start}>
              Run a mock interview
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6" onClick={() => navigate("/pricing")}>
              See interview plans
            </Button>
          </Reveal>
        </Section>

        {/* ---------------------------- career assistant ------------------------ */}
        <Section id="assistant" className="border-t border-border/60">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal delay={100} className="lg:order-2"><AssistantVisual /></Reveal>
            <Reveal className="space-y-5 lg:order-1">
              <Eyebrow>04 — Career assistant</Eyebrow>
              <Heading>Your career strategist, whenever you need it.</Heading>
              <Lede>
                The assistant sees your resume, your matches, your pipeline, and your interview history — so its answers
                are about your search, not job-hunting in general.
              </Lede>
              <ul className="space-y-2">
                {[
                  "What jobs should I apply to?",
                  "Why am I getting rejected?",
                  "How should I improve my resume?",
                  "What should I practice before my interview?",
                  "Which skills should I learn next?",
                ].map((q) => (
                  <li key={q} className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm text-muted-foreground">
                    “{q}”
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Section>

        {/* -------------------------------- analytics --------------------------- */}
        <Section className="border-t border-border/60 bg-card/30">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="space-y-5">
              <Eyebrow>05 — Career analytics</Eyebrow>
              <Heading>A command center for your search.</Heading>
              <Lede>
                Track what's moving and what's stuck: ATS health, pipeline stages, interview performance over time,
                competency trends, and how ready you are for the roles you're targeting.
              </Lede>
              <ul className="grid gap-2 sm:grid-cols-2">
                {["ATS health", "Application pipeline", "Interview performance", "Competency trends", "Job readiness", "Practice progress"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100}><AnalyticsVisual /></Reveal>
          </div>
        </Section>

        {/* ------------------------------- audience ----------------------------- */}
        <Section className="border-t border-border/60">
          <Reveal className="space-y-5">
            <Eyebrow>Who it's for</Eyebrow>
            <Heading>Built for people actively moving toward a job.</Heading>
          </Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCE.map((a, i) => (
              <Reveal key={a.title} delay={i * 50} className="bg-card">
                <Glare className="h-full p-6" radius="0px">
                  <div>
                    <div id={a.id} className="scroll-mt-28" />
                    <a.icon className="h-5 w-5 text-primary" aria-hidden />
                    <h3 className="mt-4 text-sm font-semibold text-foreground">{a.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.copy}</p>
                  </div>
                </Glare>
              </Reveal>
            ))}
            <Reveal delay={250} className="flex flex-col justify-center bg-card p-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Not sure where you fit? Start free — Gradr adapts to the stage you're actually at.
              </p>
              <Button variant="outline" className="mt-4 h-11 w-full sm:w-auto" onClick={start}>
                Get started free
              </Button>
            </Reveal>
          </div>
        </Section>

        {/* ------------------------------ how it works -------------------------- */}
        <Section id="how-it-works" className="border-t border-border/60 bg-card/30">
          <Reveal className="space-y-5">
            <Eyebrow>How it works</Eyebrow>
            <Heading>Seven steps, one system.</Heading>
          </Reveal>

          <ol className="mt-10 space-y-px overflow-hidden rounded-2xl border border-border bg-border">
            {HOW.map((step, i) => (
              <Reveal as="li" key={step} delay={i * 40} className="flex items-center gap-4 bg-card px-5 py-4 sm:px-6">
                <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium text-foreground sm:text-base">{step}</span>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={80} className="mt-8">
            <Button size="lg" className="h-12 px-6" onClick={start}>
              Start building your career system
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </Reveal>
        </Section>

        {/* -------------------------------- why gradr --------------------------- */}
        <Section className="border-t border-border/60">
          <Reveal className="space-y-5">
            <Eyebrow>Why Gradr</Eyebrow>
            <Heading>Same job search. Different workflow.</Heading>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Reveal className="rounded-2xl border border-border bg-secondary/20 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                The usual setup
              </h3>
              <ul className="mt-5 space-y-3">
                {OLD_WAY.map((t) => (
                  <li key={t} className="flex gap-3 text-sm text-muted-foreground">
                    <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-muted-foreground/80">
                Five tools that never talk to each other.
              </p>
            </Reveal>

            <Reveal delay={100} className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Gradr</h3>
              <ul className="mt-5 space-y-3">
                {NEW_WAY.map((t) => (
                  <li key={t} className="flex gap-3 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-muted-foreground">
                One connected career system.
              </p>
            </Reveal>
          </div>
        </Section>

        {/* --------------------------------- pricing ---------------------------- */}
        <Section id="pricing" className="border-t border-border/60 bg-card/30">
          <Reveal className="space-y-5">
            <Eyebrow>Pricing</Eyebrow>
            <Heading>Start free. Upgrade when it's working.</Heading>
            <Lede>No trials that expire without warning, no countdown timers. Cancel any time.</Lede>
          </Reveal>

          <Reveal delay={60} className="mt-8">
            <div
              role="group"
              aria-label="Billing interval"
              className="inline-flex rounded-xl border border-border bg-secondary/40 p-1"
            >
              {(["monthly", "annual"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={billing === k}
                  onClick={() => setBilling(k)}
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                    billing === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "monthly" ? "Monthly" : "Annual"}
                  {k === "annual" && <span className="ml-2 text-[11px] opacity-80">save up to 26%</span>}
                </button>
              ))}
            </div>
          </Reveal>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p, i) => {
              const price = p[billing];
              return (
                <Reveal
                  key={p.name}
                  delay={i * 70}
                  className={`flex flex-col rounded-2xl border p-6 ${
                    p.highlight
                      ? "border-primary/40 bg-primary/[0.05] shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.6)]"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">{p.name}</h3>
                    {p.highlight && (
                      <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Most complete
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>

                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight tabular-nums text-foreground">{price.price}</span>
                    <span className="text-sm text-muted-foreground">{price.note}</span>
                  </div>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="mt-6 h-11 w-full"
                    variant={p.highlight ? "default" : "outline"}
                    onClick={() => (p.name === "Free" ? start() : navigate(user ? "/pricing" : "/auth"))}
                  >
                    {p.cta}
                  </Button>
                </Reveal>
              );
            })}
          </div>
        </Section>

        {/* ----------------------------------- faq ------------------------------ */}
        <Section id="faq" className="border-t border-border/60">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <Reveal className="space-y-5">
              <Eyebrow>FAQ</Eyebrow>
              <Heading>Questions, answered directly.</Heading>
            </Reveal>
            <Reveal delay={80}>
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map(([q, a], i) => (
                  <AccordionItem key={q} value={`faq-${i}`} className="border-border">
                    <AccordionTrigger className="py-4 text-left text-sm font-medium hover:no-underline sm:text-base">
                      {q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </Section>

        {/* -------------------------------- final CTA --------------------------- */}
        <Section className="border-t border-border/60">
          <Reveal className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card px-6 py-14 text-center sm:px-12 sm:py-20">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/10 to-transparent" aria-hidden />
            <h2 className="relative mx-auto max-w-3xl text-balance text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
              Your next opportunity deserves more than another resume.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Build a smarter career system with Gradr.
            </p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-7 text-base" onClick={start}>
                Get started free
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-7 text-base"
                onClick={() => document.getElementById("product")?.scrollIntoView({ behavior: "smooth" })}
              >
                Explore Gradr
              </Button>
            </div>
          </Reveal>
        </Section>
      </main>

      {/* --------------------------------- footer ------------------------------ */}
      <footer className="border-t border-border bg-card/40 px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BrandLogo size={28} />
              <span className="text-base font-bold tracking-[0.24em]">GRADR</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              An AI career operating system for the whole path from resume to offer.
            </p>
          </div>

          {FOOTER.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Gradr. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">Built for people actively looking for their next role.</p>
        </div>
      </footer>
    </div>
  );
}
