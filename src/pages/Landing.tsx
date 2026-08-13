import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Check, FileText, Target, Mic, LineChart, Briefcase, Users,
  GraduationCap, Rocket, Compass, Award, Menu, X, Sparkles, ShieldCheck,
  Layers, Bot, Search, Send, RefreshCw, BarChart3, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { Reveal } from "@/components/landing/Reveal";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  Atmosphere, CountUp, Magnetic, Parallax, ScrollProgress, TextReveal, TiltCard,
  easeOut, viewportOnce, springSnappy,
} from "@/components/motion";
import { HeroCommandCenter } from "@/components/landing/HeroCommandCenter";
import {
  HeroWorkspace, ResumeVisual, MatchVisual, ApplicationVisual,
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
    <motion.span
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={viewportOnce}
      transition={{ duration: 0.5, ease: easeOut }}
      className="type-eyebrow inline-flex items-center gap-2 text-brand-secondary"
    >
      <motion.span
        className="h-px w-6 origin-left bg-brand-secondary/70"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={viewportOnce}
        transition={{ duration: 0.6, ease: easeOut, delay: 0.1 }}
        aria-hidden
      />
      {children}
    </motion.span>
  );
}

function Heading({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  if (typeof children === "string") {
    return <TextReveal as="h2" text={children} className={`type-section text-balance ${className}`} />;
  }
  return <h2 className={`type-section text-balance ${className}`}>{children}</h2>;
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="type-lede max-w-2xl text-muted-foreground">{children}</p>;
}


/* ---------------------------------- page ----------------------------------- */

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

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

      {/* --------------------------------- nav -------------------------------- */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "border-b border-border bg-background/80 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <nav
          aria-label="Main"
          className={`mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 transition-all sm:px-8 ${scrolled ? "h-14" : "h-16"}`}
        >
          <a href="#hero" className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandLogo size={28} />
            <span className="text-base font-bold tracking-[0.24em]">GRADR</span>
          </a>

          <ul className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <li key={n.label}>
                <a
                  href={n.href}
                  className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <ThemeToggle className="min-h-9 min-w-9" />
            {user ? (
              <Button size="sm" onClick={() => navigate("/")}>Open Gradr</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={login}>Log in</Button>
                <Button size="sm" onClick={start}>Get started</Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-border bg-background/98 px-5 py-4 backdrop-blur-xl lg:hidden">
            <ul className="space-y-1">
              {NAV.map((n) => (
                <li key={n.label}>
                  <a
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              {user ? (
                <Button className="flex-1" onClick={() => navigate("/")}>Open Gradr</Button>
              ) : (
                <>
                  <Button variant="outline" className="flex-1" onClick={login}>Log in</Button>
                  <Button className="flex-1" onClick={start}>Get started</Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* -------------------------------- hero -------------------------------- */}
      <main id="hero">
        <motion.div className="relative pt-28 sm:pt-32" style={heroReduced ? undefined : { opacity: heroOpacity }}>
          <Atmosphere />

          <Section className="!pb-0 !pt-0">
            <motion.div
              className="grid items-center gap-12 lg:grid-cols-[1.02fr_1.05fr] lg:gap-14"
              style={heroReduced ? undefined : { y: heroLift }}
            >
              <div className="space-y-7">
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: easeOut }}
                  className="type-eyebrow inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/60 px-3 py-1.5 text-brand-secondary backdrop-blur"
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  AI career operating system
                </motion.span>

                <h1 className="type-hero text-balance">
                  <TextReveal as="span" text="Your AI career" className="block" immediate delay={0.1} />
                  <TextReveal
                    as="span"
                    text="command center."
                    className="block animated-gradient-text"
                    immediate
                    delay={0.28}
                  />
                </h1>

                <motion.p
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: easeOut, delay: 0.5 }}
                  className="type-lede max-w-xl text-muted-foreground"
                >
                  Gradr scores your resume, ranks live roles against your real skills, runs spoken mock
                  interviews and tracks every application — one intelligent system that remembers your
                  whole search.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: easeOut, delay: 0.62 }}
                  className="flex flex-col gap-3 sm:flex-row"
                >
                  <Magnetic strength={8}>
                    <Button asChild size="lg" className="group h-12 px-6 text-base">
                      <motion.button type="button" onClick={start} whileTap={{ scale: 0.97 }} transition={springSnappy}>
                        Get started free
                        <ArrowRight
                          className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                          aria-hidden
                        />
                      </motion.button>
                    </Button>
                  </Magnetic>
                  <Magnetic strength={6}>
                    <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        transition={springSnappy}
                        onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                      >
                        See how Gradr works
                      </motion.button>
                    </Button>
                  </Magnetic>
                </motion.div>

                <motion.dl
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                  className="grid max-w-lg grid-cols-3 gap-4 border-t border-border/60 pt-6"
                >
                  {[
                    { label: "Modules in the loop", value: 8, suffix: "" },
                    { label: "ATS signals checked", value: 40, suffix: "+" },
                    { label: "Interview personas", value: 12, suffix: "" },
                  ].map((s) => (
                    <div key={s.label}>
                      <dt className="sr-only">{s.label}</dt>
                      <dd className="font-display text-2xl font-bold tracking-tight text-foreground">
                        <CountUp to={s.value} suffix={s.suffix} duration={1.6} immediate />
                      </dd>
                      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </motion.dl>
              </div>

              <div className="lg:pl-4">
                <HeroCommandCenter />
              </div>
            </motion.div>
          </Section>
        </motion.div>


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
        <Section className="border-t border-border/60 bg-card/30">
          <Reveal className="space-y-5">
            <Eyebrow>The Gradr system</Eyebrow>
            <Heading>Eight modules. One continuous loop.</Heading>
            <Lede>
              Gradr doesn't treat each career task as a separate tool. Your resume informs your matches, your matches
              shape your applications, your applications set up your interviews, and every interview improves the next pass.
            </Lede>
          </Reveal>

          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {SYSTEM.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 50} className="group bg-card p-5 transition-colors hover:bg-secondary/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tabular-nums tracking-widest text-primary">{s.n}</span>
                  <s.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.copy}</p>
              </Reveal>
            ))}
          </ol>
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
              <Reveal key={a.title} delay={i * 50} className="bg-card p-6">
                <div id={a.id} className="scroll-mt-28" />
                <a.icon className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-sm font-semibold text-foreground">{a.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a.copy}</p>
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
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                      className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
