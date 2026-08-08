import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight, Check, FileText, ShieldCheck, Target, Sparkles, Mic, LineChart,
  Briefcase, Search, Layers, Bot, GraduationCap, Rocket, Compass, Award,
  Camera, Waves, Clock, Menu, X, CircleDot, BarChart3, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";

/* --------------------------------- data --------------------------------- */

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "AI Interview", href: "#interview" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const VALUE_STRIP = [
  { icon: FileText, label: "Optimize your resume" },
  { icon: Target, label: "Find better matches" },
  { icon: Mic, label: "Practice real interviews" },
  { icon: LineChart, label: "Track your career progress" },
];

const FLOW = ["Resume", "ATS Optimization", "Job Matching", "Application", "AI Interview", "Feedback", "Career Growth"];

const WORKFLOW = [
  { n: "01", title: "BUILD", copy: "Create and manage a professional resume." },
  { n: "02", title: "OPTIMIZE", copy: "Analyze ATS compatibility and improve your resume." },
  { n: "03", title: "DISCOVER", copy: "Find jobs matched to your skills, experience, and goals." },
  { n: "04", title: "APPLY", copy: "Track every application from one pipeline." },
  { n: "05", title: "PRACTICE", copy: "Run realistic AI mock interviews and improve." },
];

const PERSONAS = [
  { role: "Software Engineer", persona: "Technical Engineering Interviewer" },
  { role: "Product Manager", persona: "Senior Product Leader" },
  { role: "Investment Banking", persona: "High-Pressure Banking VP" },
  { role: "Management Consulting", persona: "Strategy Consultant" },
  { role: "Sales", persona: "Enterprise Sales Manager" },
  { role: "Marketing", persona: "Marketing Director" },
  { role: "Healthcare", persona: "Clinical Hiring Manager" },
  { role: "HR", persona: "Senior HR Recruiter" },
];

const AUDIENCE = [
  { icon: GraduationCap, title: "Students", copy: "Build career confidence before your first major interview." },
  { icon: Award, title: "Graduates", copy: "Turn your education into a competitive application." },
  { icon: Rocket, title: "Early-career", copy: "Apply smarter and improve faster." },
  { icon: Compass, title: "Career changers", copy: "Translate your existing experience into a new direction." },
  { icon: Briefcase, title: "Experienced professionals", copy: "Target better opportunities with stronger positioning." },
];

const HOW = [
  { n: "01", title: "Create your profile" },
  { n: "02", title: "Add your resume and target roles" },
  { n: "03", title: "Apply and practice" },
  { n: "04", title: "Use AI feedback to improve" },
];

const FAQS = [
  ["What is Gradr?", "Gradr is an AI-powered career operating system that connects your resume, ATS optimization, job matching, applications, interview practice, and career analytics in one workspace."],
  ["Who is Gradr for?", "Students, university students, recent graduates, early-career professionals, career changers, and anyone actively applying for jobs."],
  ["Is Gradr free?", "Yes. The Free plan includes basic resume tools, basic job discovery, application tracking, and a short guided preview of the AI Mock Interview."],
  ["What does Pro include?", "Unlimited live interview sessions, advanced role and company simulations, advanced interviewer personas, deep reports and transcript analysis, personalized improvement plans, long-term analytics, role readiness tracking, sharing and exports."],
  ["How does the AI Mock Interview work?", "You choose a target role, then hold a real spoken conversation with an adaptive AI interviewer. It asks follow-ups based on your answers, and afterwards you get a scored report with concrete coaching."],
  ["Does Gradr use my camera?", "Only if you enable it. Camera analysis runs on-device to produce practice integrity signals such as presence, framing, and attention observations."],
  ["Is my interview video stored?", "No. Raw video is not retained by default — only derived coaching signals are used for your feedback."],
  ["How does the AI interviewer adapt to my job?", "The interviewer adapts to the selected job, company, industry, seniority, and interview stage, and you can override the automatically selected persona."],
  ["Can I practice without voice?", "Yes. You can type your answers and still receive the same structured scorecard."],
  ["Can I cancel my subscription?", "Yes. Manage, upgrade, downgrade, or cancel at any time from the billing portal in your account."],
  ["How does Gradr protect my data?", "Your data is scoped to your account with row-level access rules, camera analysis stays on your device, and you can delete your interview data whenever you want."],
];

const PLANS = {
  free: {
    name: "Free", price: "$0", note: "forever",
    description: "Get career-ready with the essentials.",
    features: [
      "Guided AI interview preview",
      "One short sample mock experience",
      "Basic resume tools",
      "Basic ATS scoring",
      "Basic job discovery",
      "Basic application tracking",
    ],
  },
  starter: {
    monthly: { price: "$9", note: "per month" },
    annual: { price: "$84", note: "per year · save $24" },
    name: "Starter",
    description: "Meaningful usage for an active job search.",
    features: [
      "More AI interview sessions",
      "Expanded resume + ATS features",
      "Job matching",
      "Application tracking",
      "More interview reports",
      "Selected interviewer personas",
      "Limited analytics",
    ],
  },
  pro: {
    monthly: { price: "$19", note: "per month" },
    annual: { price: "$168", note: "per year · $14/month" },
    name: "Pro",
    description: "For serious job seekers who want every advantage.",
    features: [
      "Unlimited live interview sessions",
      "Advanced company + role simulations",
      "Advanced interviewer personas",
      "Deep reports and transcript analysis",
      "Personalized improvement plans",
      "Long-term analytics and role readiness",
      "Coach/mentor sharing and exports",
      "Advanced AI career features",
    ],
  },
};

/* ------------------------------- primitives ------------------------------ */

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`w-full px-5 sm:px-8 py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-primary">
      {children}
    </span>
  );
}

function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glassmorphic rounded-2xl ${className}`}>{children}</div>;
}

/* --------------------------------- page ---------------------------------- */

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goStart = () => navigate(user ? "/" : "/auth");

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden scroll-smooth">
      <Helmet>
        <title>Gradr | Your Career, Upgraded</title>
        <meta
          name="description"
          content="Gradr is an AI-powered career platform for resumes, ATS optimization, job matching, applications, interview practice, and career growth."
        />
        <link rel="canonical" href="https://careerflowos.lovable.app/landing" />
        <meta property="og:title" content="Gradr | Your Career, Upgraded" />
        <meta
          property="og:description"
          content="An AI career operating system: resume, ATS, job matching, applications, realistic AI mock interviews, and measurable progress."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://careerflowos.lovable.app/landing" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* ------------------------------- navbar ------------------------------ */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "backdrop-blur-xl bg-background/70 border-b border-border" : "bg-transparent"
        }`}
      >
        <nav className={`mx-auto max-w-6xl px-5 sm:px-8 flex items-center justify-between transition-all ${scrolled ? "h-14" : "h-16"}`}>
          <a href="#top" className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <span className="text-base font-bold tracking-[0.2em] text-foreground">GRADR</span>
          </a>

          <ul className="hidden md:flex items-center gap-7">
            {NAV.map((n) => (
              <li key={n.label}>
                <a href={n.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <Button size="sm" onClick={() => navigate("/")}>Open Dashboard</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>Log in</Button>
                <Button size="sm" onClick={() => navigate("/auth")}>Get Started</Button>
              </>
            )}
          </div>

          <button
            className="md:hidden text-muted-foreground"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl px-5 py-4 space-y-3">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm text-muted-foreground hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              {user ? (
                <Button className="flex-1" onClick={() => navigate("/")}>Open Dashboard</Button>
              ) : (
                <>
                  <Button variant="outline" className="flex-1" onClick={() => navigate("/auth")}>Log in</Button>
                  <Button className="flex-1" onClick={() => navigate("/auth")}>Get Started</Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* -------------------------------- hero ------------------------------- */}
      <div id="top" className="relative pt-28 sm:pt-36">
        <div className="pointer-events-none absolute inset-0 -z-10 aurora-bg opacity-[0.55]" aria-hidden />
        <Section className="!py-0 pb-16 sm:pb-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div className="space-y-6">
              <Eyebrow><CircleDot className="h-3 w-3" /> AI career operating system</Eyebrow>
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
                Your career, <span className="kinetic-text">upgraded.</span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl">
                Gradr brings your resume, job search, applications, interview practice, and career growth
                into one intelligent workspace.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={goStart} className="hover-lift">
                  {user ? "Open Dashboard" : "Start for free"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#product">Explore Gradr</a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Built for students, graduates, and ambitious job seekers.
              </p>
            </div>

            <HeroPreview />
          </div>
        </Section>
      </div>

      {/* ----------------------------- value strip ---------------------------- */}
      <div className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl grid grid-cols-2 lg:grid-cols-4 gap-3">
          {VALUE_STRIP.map(({ icon: Icon, label }) => (
            <Panel key={label} className="p-4 flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm text-foreground">{label}</span>
            </Panel>
          ))}
        </div>
      </div>

      {/* ---------------------------- what is gradr --------------------------- */}
      <Section id="product">
        <div className="max-w-2xl space-y-4">
          <Eyebrow>What is Gradr</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Everything you need to move your career forward.
          </h2>
          <p className="text-muted-foreground">
            Gradr is an AI-powered career operating system that connects every part of the job search.
            Traditional tools force you into separate products for resume optimization, ATS checking,
            job searching, application tracking, interview preparation, and career analytics. Gradr
            brings them together into one connected workflow.
          </p>
        </div>

        <Panel className="mt-10 p-6 sm:p-8">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((step, i) => (
              <li key={step} className="relative rounded-xl border border-border bg-card/60 p-4">
                <span className="text-[11px] font-mono text-primary">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-sm font-semibold text-foreground mt-1">{step}</p>
                {i < FLOW.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/40" />
                )}
              </li>
            ))}
          </ol>
        </Panel>
      </Section>

      {/* ----------------------------- core workflow -------------------------- */}
      <Section className="border-y border-border bg-card/20">
        <div className="max-w-2xl space-y-3">
          <Eyebrow>Core workflow</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">From resume to offer, without the chaos.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW.map((s) => (
            <Panel key={s.n} className="p-5 hover-lift">
              <p className="text-xs font-mono text-primary">{s.n}</p>
              <p className="text-sm font-bold tracking-wide text-foreground mt-2">{s.title}</p>
              <p className="text-sm text-muted-foreground mt-2">{s.copy}</p>
            </Panel>
          ))}
        </div>
        <Button variant="outline" className="mt-8" asChild>
          <a href="#features">Explore the workflow <ArrowRight className="h-4 w-4 ml-2" /></a>
        </Button>
      </Section>

      {/* --------------------------- feature showcase ------------------------- */}
      <Section id="features" className="space-y-24">
        <Feature
          eyebrow="Resume Intelligence"
          title="Turn your resume into a competitive advantage."
          copy="Gradr analyzes resume structure, keywords, impact, experience, formatting, and job alignment — then tells you exactly what to change."
          cta={{ label: "Optimize your resume", onClick: goStart }}
          visual={
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "ATS Score", value: "86" },
                { label: "Keywords", value: "24 matched" },
                { label: "Formatting", value: "Clean" },
                { label: "Impact", value: "12 metrics" },
              ].map((c) => (
                <Panel key={c.label} className="p-4">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-semibold text-foreground mt-1">{c.value}</p>
                </Panel>
              ))}
              <Panel className="p-4 col-span-2">
                <p className="text-xs text-muted-foreground mb-2">Recommendations</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="text-primary">•</span>Quantify impact in your two most recent roles</li>
                  <li className="flex gap-2"><span className="text-primary">•</span>Add 4 missing keywords from the target job description</li>
                </ul>
              </Panel>
            </div>
          }
        />

        <Feature
          reverse
          eyebrow="ATS Engine"
          title="Know how your resume performs before you apply."
          copy="Analyze your resume against any job description and surface missing keywords, weak bullet points, skill gaps, formatting problems, and experience alignment."
          visual={<AtsVisual />}
        />

        <Feature
          eyebrow="Job Matching"
          title="Stop searching. Start matching."
          copy="Gradr evaluates skills, experience, role, seniority, your resume, the job description, and your career goals to rank what's genuinely worth applying to."
          visual={
            <Panel className="p-6 space-y-4">
              {[
                { role: "Frontend Engineer · Series B SaaS", match: 92 },
                { role: "Product Analyst · Fintech", match: 81 },
                { role: "Associate PM · Marketplace", match: 74 },
              ].map((j) => (
                <div key={j.role} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{j.role}</span>
                    <span className="text-primary font-semibold tabular-nums">{j.match}% Match</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${j.match}%` }} />
                  </div>
                </div>
              ))}
            </Panel>
          }
        />

        <Feature
          reverse
          eyebrow="Application Tracker"
          title="Every application. One pipeline."
          copy="Move roles through your pipeline, keep notes and reminders in context, and always know what needs your attention next."
          visual={<PipelineVisual />}
        />
      </Section>

      {/* --------------------------- AI mock interview ------------------------ */}
      <Section id="interview" className="border-y border-border bg-card/20">
        <div className="max-w-2xl space-y-4">
          <Eyebrow><Mic className="h-3 w-3" /> Flagship</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Practice interviews that actually feel like interviews.
          </h2>
          <p className="text-muted-foreground">
            Gradr's AI Mock Interview simulates realistic conversations instead of simply showing you a
            list of questions.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <TechCard
            icon={Waves}
            title="Gemini Live"
            items={["Real-time conversational AI", "Natural voice interaction", "Adaptive questioning", "Multi-turn conversation", "Natural follow-ups and interruptions"]}
          />
          <TechCard
            icon={Mic}
            title="Fish Audio"
            items={["Premium voice fallback", "More natural interviewer voices", "Provider abstraction for future voice providers"]}
          />
          <TechCard
            icon={Camera}
            title="MediaPipe"
            items={["Camera-based visual analysis", "Face presence and framing", "Gaze direction estimates", "Head pose and attention patterns", "Nonverbal communication signals"]}
          />
        </div>

        <Panel className="mt-4 p-6">
          <p className="text-sm font-semibold text-foreground mb-2">Practice integrity monitoring</p>
          <p className="text-sm text-muted-foreground">
            Gradr surfaces interview integrity signals — obvious disruptions, face absence, multiple people
            where technically possible, and attention observations where available. These are neutral coaching
            observations, not accusations, and they are not a guarantee of detection.
          </p>
        </Panel>

        <div className="mt-12">
          <InterviewRoomVisual />
        </div>

        {/* personas */}
        <div className="mt-16 space-y-4">
          <h3 className="text-2xl font-bold tracking-tight">An interviewer that matches the job.</h3>
          <p className="text-muted-foreground max-w-2xl">
            The interviewer adapts to the selected job, company, industry, seniority, and interview stage —
            each with its own personality, questioning style, tone, difficulty, voice, and follow-up behaviour.
            You can always override the automatically selected persona.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PERSONAS.map((p) => (
              <Panel key={p.role} className="p-4 hover-lift">
                <p className="text-sm font-semibold text-foreground">{p.role}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.persona}</p>
              </Panel>
            ))}
          </div>
        </div>

        {/* report */}
        <div className="mt-16 space-y-4">
          <h3 className="text-2xl font-bold tracking-tight">Don't just finish the interview. Learn from it.</h3>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
            <Panel className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <ScoreTile label="Overall Score" value="84" big />
                <ScoreTile label="Readiness" value="Strong" big />
                <ScoreTile label="Communication" value="88" />
                <ScoreTile label="Structure" value="82" />
                <ScoreTile label="Relevance" value="91" />
                <ScoreTile label="Evidence" value="76" />
                <ScoreTile label="Technical Depth" value="87" />
              </div>
            </Panel>
            <Panel className="p-6 space-y-4">
              {[
                ["Strongest answer", "Your system design walkthrough — clear tradeoffs and a decisive recommendation."],
                ["Weakest answer", "Conflict example lacked a measurable outcome."],
                ["Missed opportunities", "You never mentioned the migration you led — it directly answers the scale question."],
                ["Suggested stronger response", "Reframe with STAR and close with the metric you moved."],
                ["Recommended practice", "Two behavioural reps focused on evidence and outcomes."],
                ["Next interview focus", "Quantified impact and tighter answer structure."],
              ].map(([label, body]) => (
                <div key={label}>
                  <p className="text-xs uppercase tracking-wide text-primary">{label}</p>
                  <p className="text-sm text-muted-foreground mt-1">{body}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Scores are coaching estimates, not hiring predictions.
              </p>
            </Panel>
          </div>
        </div>

        {/* privacy */}
        <Panel className="mt-12 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Lock className="h-5 w-5 text-primary" />
            </span>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Your interview should be private.</h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex gap-2"><span className="text-primary">•</span>Camera analysis is consent-based, according to the experience you select.</li>
                <li className="flex gap-2"><span className="text-primary">•</span>Raw video is not retained by default.</li>
                <li className="flex gap-2"><span className="text-primary">•</span>Only derived coaching signals are used for feedback.</li>
                <li className="flex gap-2"><span className="text-primary">•</span>You can delete your interview data at any time.</li>
                <li className="flex gap-2"><span className="text-primary">•</span>AI scores are coaching estimates, not hiring decisions.</li>
              </ul>
            </div>
          </div>
        </Panel>
      </Section>

      {/* --------------------------- career assistant ------------------------- */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <Eyebrow><Bot className="h-3 w-3" /> Career Assistant</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Your AI career copilot.</h2>
            <p className="text-muted-foreground">
              Connected to your entire Gradr workspace — your resume, target roles, applications and
              interview history — so its advice is about your search, not generic career tips.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Improve resumes", "Understand job descriptions", "Prepare for interviews",
              "Draft outreach", "Analyze career gaps", "Recommend next steps",
              "Plan applications", "Explain job requirements",
            ].map((c) => (
              <Panel key={c} className="p-4 flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-foreground">{c}</span>
              </Panel>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------ audience ----------------------------- */}
      <Section className="border-y border-border bg-card/20">
        <div className="max-w-2xl space-y-3">
          <Eyebrow>Who it's for</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Built for every stage of a career.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCE.map(({ icon: Icon, title, copy }) => (
            <Panel key={title} className="p-6 hover-lift">
              <span className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <p className="text-sm font-bold tracking-wide text-foreground mt-4 uppercase">{title}</p>
              <p className="text-sm text-muted-foreground mt-2">{copy}</p>
            </Panel>
          ))}
        </div>
      </Section>

      {/* ------------------------------ analytics ---------------------------- */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <Eyebrow><BarChart3 className="h-3 w-3" /> Progress</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">See whether you're actually getting better.</h2>
            <p className="text-muted-foreground">
              Gradr turns your career activity into measurable progress: ATS score history, interview score
              trends, competency trends, applications, interview conversion, job match quality, practice
              streaks, and readiness by role.
            </p>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Interview score</span>
              <span className="font-semibold text-foreground tabular-nums">72</span>
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-foreground tabular-nums">78</span>
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-primary tabular-nums">84</span>
            </div>
          </div>
          <Panel className="p-6">
            <p className="text-sm font-semibold text-foreground mb-4">Interview score trend</p>
            <div className="flex items-end gap-2 h-40">
              {[52, 58, 61, 66, 72, 78, 84].map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-primary/30 to-primary" style={{ height: `${v}%` }} />
                  <span className="text-[10px] text-muted-foreground tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[["Applications", "34"], ["Interview rate", "21%"], ["Practice streak", "6 days"]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-secondary/60 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{l}</p>
                  <p className="text-sm font-semibold text-foreground">{v}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      {/* ------------------------------ how it works -------------------------- */}
      <Section className="border-y border-border bg-card/20">
        <div className="max-w-2xl space-y-3">
          <Eyebrow>How Gradr works</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Set up in minutes. Improve for months.</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((s) => (
            <Panel key={s.n} className="p-6">
              <p className="text-xs font-mono text-primary">{s.n}</p>
              <p className="text-sm font-semibold text-foreground mt-2">{s.title}</p>
            </Panel>
          ))}
        </div>
        <Button className="mt-8" onClick={goStart}>
          Start building your career system <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Section>

      {/* -------------------------------- pricing ---------------------------- */}
      <Section id="pricing">
        <div className="max-w-2xl space-y-3">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Start free. Upgrade when it matters.</h2>
          <p className="text-muted-foreground">Switch to annual and save.</p>
        </div>

        <div className="mt-8 inline-flex rounded-full border border-border bg-card/60 p-1">
          {(["monthly", "annual"] as const).map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                interval === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {i === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <PriceCard
            name={PLANS.free.name}
            price={PLANS.free.price}
            note={PLANS.free.note}
            description={PLANS.free.description}
            features={PLANS.free.features}
            cta={user ? "Open Dashboard" : "Start for free"}
            onClick={goStart}
          />
          <PriceCard
            name={PLANS.starter.name}
            price={PLANS.starter[interval].price}
            note={PLANS.starter[interval].note}
            description={PLANS.starter.description}
            features={PLANS.starter.features}
            cta="Choose Starter"
            onClick={() => navigate("/pricing")}
          />
          <PriceCard
            highlighted
            badge={interval === "annual" ? "BEST VALUE" : undefined}
            name={PLANS.pro.name}
            price={PLANS.pro[interval].price}
            note={PLANS.pro[interval].note}
            description={PLANS.pro.description}
            features={PLANS.pro.features}
            cta="Go Pro"
            onClick={() => navigate("/pricing")}
          />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Secure billing with card payments. Cancel or change your plan any time.
        </p>
      </Section>

      {/* --------------------------------- FAQ -------------------------------- */}
      <Section id="faq" className="border-y border-border bg-card/20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Questions, answered.</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-left text-sm">{q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* ------------------------------ final CTA ----------------------------- */}
      <Section>
        <Panel className="p-10 sm:p-14 text-center relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 aurora-bg" aria-hidden />
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Your next opportunity starts with better preparation.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Build stronger applications, practice smarter, and walk into your next interview ready.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={goStart} className="hover-lift">
              {user ? "Open Dashboard" : "Start for free"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#product">Explore Gradr</a>
            </Button>
          </div>
        </Panel>
      </Section>

      {/* -------------------------------- footer ------------------------------ */}
      <footer className="border-t border-border px-5 sm:px-8 py-14">
        <div className="mx-auto max-w-6xl grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <span className="text-base font-bold tracking-[0.2em]">GRADR</span>
            </div>
            <p className="text-sm text-muted-foreground">Your career, upgraded.</p>
          </div>

          <FooterCol
            title="Product"
            links={[
              ["Resume", "/resume"], ["ATS", "/resume"], ["Job Matching", "/match"],
              ["Applications", "/pipeline"], ["AI Mock Interview", "/interview"],
              ["Career Assistant", "/growth"], ["Analytics", "/growth"],
            ]}
          />
          <FooterCol title="Company" links={[["About", "#product"], ["Contact", "#faq"], ["Careers", "#faq"]]} />
          <div className="space-y-6">
            <FooterCol
              title="Resources"
              links={[["Help Center", "#faq"], ["Blog", "/blog/ai-resume-optimization"], ["Interview Resources", "#interview"]]}
            />
            <FooterCol title="Legal" links={[["Privacy", "#interview"], ["Terms", "#faq"], ["Cookie Policy", "#faq"]]} />
          </div>
        </div>
        <div className="mx-auto max-w-6xl mt-10 pt-6 border-t border-border text-xs text-muted-foreground">
          © {new Date().getFullYear()} Gradr. AI outputs are coaching estimates, not hiring decisions.
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------- subcomponents ---------------------------- */

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-3">{title}</p>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("#") ? (
              <a href={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{label}</a>
            ) : (
              <Link to={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feature({
  eyebrow, title, copy, visual, reverse, cta,
}: {
  eyebrow: string; title: string; copy: string; visual: React.ReactNode; reverse?: boolean;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
      <div className={`space-y-4 ${reverse ? "lg:order-2" : ""}`}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h3>
        <p className="text-muted-foreground">{copy}</p>
        {cta && (
          <Button variant="outline" onClick={cta.onClick}>
            {cta.label} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
      <div className={reverse ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}

function TechCard({ icon: Icon, title, items }: { icon: typeof Mic; title: string; items: string[] }) {
  return (
    <Panel className="p-6 hover-lift">
      <span className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <p className="text-sm font-semibold text-foreground mt-4">{title}</p>
      <ul className="mt-3 space-y-1.5">
        {items.map((i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className="text-primary">•</span><span>{i}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ScoreTile({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-card/60 p-4 ${big ? "col-span-1" : ""}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-bold text-foreground tabular-nums ${big ? "text-3xl" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function PriceCard({
  name, price, note, description, features, cta, onClick, highlighted, badge,
}: {
  name: string; price: string; note: string; description: string; features: string[];
  cta: string; onClick: () => void; highlighted?: boolean; badge?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col ${
        highlighted ? "glassmorphic glow-border ring-1 ring-primary/40" : "glass-card"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-bold tracking-wider text-primary-foreground">
          {badge}
        </span>
      )}
      <p className="text-sm font-semibold text-foreground">{name}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight text-foreground">{price}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-3">{description}</p>
      <ul className="mt-5 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="text-sm text-muted-foreground flex gap-2">
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button className="mt-6 w-full" variant={highlighted ? "default" : "outline"} onClick={onClick}>
        {cta}
      </Button>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" aria-hidden />
      <Panel className="p-5 sm:p-6 float-slow">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-muted-foreground">Career readiness</p>
            <p className="text-sm font-semibold text-foreground">Frontend Engineer track</p>
          </div>
          <span className="text-xs rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">Live</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile icon={ShieldCheck} label="ATS score" value="86" sub="+8 this week" />
          <StatTile icon={Target} label="Top job match" value="92%" sub="Series B SaaS" />
          <StatTile icon={Layers} label="Active applications" value="12" sub="3 in interview" />
          <StatTile icon={Mic} label="Interview readiness" value="Strong" sub="Score 84" />
        </div>

        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-primary">Recommended next action</p>
            <p className="text-sm text-foreground mt-0.5">
              Run a 15-minute mock interview focused on quantified impact before Thursday's screen.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, sub }: { icon: typeof Mic; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function AtsVisual() {
  return (
    <Panel className="p-6">
      <div className="flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0">
          <div className="absolute inset-0 rounded-full border-4 border-secondary" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-r-transparent border-b-transparent rotate-45" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-foreground">72</span>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-foreground font-semibold">ATS compatibility</p>
          <p className="text-muted-foreground">6 missing keywords · 3 weak bullets · 1 formatting issue</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {[
          ["Keyword coverage", 68],
          ["Experience alignment", 81],
          ["Formatting", 94],
          ["Skill gap closure", 57],
        ].map(([label, v]) => (
          <div key={label as string} className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-foreground tabular-nums">{v}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PipelineVisual() {
  const stages: [string, string[]][] = [
    ["Saved", ["Design Systems Eng", "Platform Eng"]],
    ["Applied", ["Frontend Eng · Fintech"]],
    ["Interview", ["Product Eng · SaaS"]],
    ["Offer", []],
    ["Rejected", ["Growth Eng"]],
  ];
  return (
    <Panel className="p-4 overflow-x-auto">
      <div className="flex gap-3 min-w-[520px]">
        {stages.map(([stage, items]) => (
          <div key={stage} className="flex-1 min-w-[100px]">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{stage}</p>
            <div className="space-y-2">
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-border h-14" />
              )}
              {items.map((i) => (
                <div key={i} className="rounded-lg border border-border bg-card/70 p-2.5 text-xs text-foreground">
                  {i}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function InterviewRoomVisual() {
  return (
    <Panel className="p-4 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card/70 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Senior Product Leader</p>
                  <p className="text-xs text-muted-foreground">Round 2 · Behavioural + product sense</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> 12:41</span>
                <span className="flex items-center gap-1"><CircleDot className="h-3 w-3 text-primary" /> Connected</span>
              </div>
            </div>

            <p className="text-sm text-foreground mt-5">
              "Walk me through a product decision you made with incomplete data. What did you ship, and what
              did you learn?"
            </p>

            <div className="mt-5 flex items-end gap-1 h-10" aria-hidden>
              {[30, 55, 80, 45, 65, 90, 40, 70, 35, 60, 85, 50, 75, 42, 62].map((h, i) => (
                <span key={i} className="flex-1 rounded-full bg-primary/60" style={{ height: `${h}%` }} />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground flex items-center gap-1"><Mic className="h-3 w-3" /> Mic live</span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground flex items-center gap-1"><Camera className="h-3 w-3" /> Camera on</span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground flex items-center gap-1"><Search className="h-3 w-3" /> Question 4 of 8</span>
            </div>

            <div className="mt-4 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full w-1/2 rounded-full bg-primary" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/70 p-4 space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Live transcript</p>
            <p className="text-muted-foreground"><span className="text-primary">Interviewer:</span> What signal made you confident enough to ship?</p>
            <p className="text-foreground"><span className="text-primary">You:</span> We ran a two-week holdout with 4,000 users and watched activation…</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/40 aspect-video flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Your camera preview</span>
          </div>
          <div className="rounded-xl border border-border bg-card/70 p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Integrity signals</p>
            {[["In frame", 97], ["Eye contact", 82], ["Attention", 88]].map(([l, v]) => (
              <div key={l as string} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="text-foreground tabular-nums">{v}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              Neutral coaching observations. Not a cheating verdict.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
