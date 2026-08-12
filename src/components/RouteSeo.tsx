import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { GUIDES_BY_SLUG } from "@/content/guides";
import { JOB_LANDINGS_BY_SLUG } from "@/content/jobLandings";
import { legalJsonLd } from "@/lib/structuredData";
import { POLICIES_UPDATED } from "@/content/legal";
import { COOKIE_POLICY_EFFECTIVE, DPA_EFFECTIVE } from "@/content/legalExtra";

const SITE = "Gradr";
const ORIGIN = "https://gradr.me";
const OG_IMAGE = `${ORIGIN}/og-image.jpg`;

const META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Dashboard",
    description: "Your Gradr dashboard — pipeline overview, AI scores, reminders, and quick actions.",
  },
  "/landing": {
    title: "From resume to offer",
    description: "Gradr brings resume intelligence, job matching, applications, and AI mock interviews into one workspace.",
  },
  "/auth": {
    title: "Sign in",
    description: "Sign in or create your Gradr account to access your AI career command center.",
  },
  "/forgot-password": {
    title: "Forgot password",
    description: "Reset your Gradr password and get back to your career workflow.",
  },
  "/reset-password": {
    title: "Reset password",
    description: "Choose a new secure password for your Gradr account and get straight back to your job search workflow.",
  },
  "/verify-email": {
    title: "Verify your email",
    description: "Confirm your email address to activate your Gradr account and unlock resume scoring, job matching, and AI mock interviews.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description: "How Gradr collects, stores, and protects your resume data, interview recordings, and account information — plus your rights and choices.",
  },
  "/terms": {
    title: "Terms & Conditions",
    description: "The terms that govern your use of Gradr, including subscriptions, AI feature usage, acceptable use, and account responsibilities.",
  },
  "/refund-policy": {
    title: "Refund Policy",
    description: "Gradr's refund window, eligibility rules, and how to request a refund for a subscription or credit purchase billed through Paddle.",
  },
  "/cookie-policy": {
    title: "Cookie Policy",
    description: "Every cookie and storage key Gradr sets, grouped by category, plus how to accept, reject, or fine-tune analytics, attribution, and functional cookies.",
  },
  "/dpa": {
    title: "Data Processing Addendum",
    description: "Gradr's DPA for universities, bootcamps, and employers — processing roles, sub-processors, security measures, international transfers, and deletion terms.",
  },
  "/resume": {
    title: "Resume Engine",
    description: "Upload your resume for AI scoring, ATS analysis, and rewrite suggestions tailored to your goals.",
  },
  "/jobs": {
    title: "Job Feed",
    description: "Personalized AI-matched job opportunities, refreshed daily and ranked to your profile.",
  },
  "/match": {
    title: "Job Matching",
    description: "Score your resume against any role and get a strategy to close the gap.",
  },
  "/pipeline": {
    title: "Pipeline",
    description: "Drag-and-drop application tracker — manage every job from saved to offer in one view.",
  },
  "/apply": {
    title: "Application Engine",
    description: "Generate tailored cover letters and recruiter outreach in one click.",
  },
  "/interview": {
    title: "Interview Engine",
    description: "Practice realtime AI mock interviews with instant feedback and coaching.",
  },
  "/interview/history": {
    title: "Interview History",
    description: "Review past AI mock interviews, track score trends, and revisit every scorecard and transcript.",
  },
  "/growth": {
    title: "Growth Engine",
    description: "AI skill gap analysis and a personalized roadmap to your next role.",
  },
  "/pricing": {
    title: "Pricing",
    description: "Simple plans for every job seeker — start free, upgrade when you need more AI power.",
  },
  "/billing": {
    title: "Billing",
    description: "Manage your Gradr plan, invoices, credit packs, and payment method in one place.",
  },
  "/settings": {
    title: "Settings",
    description: "Manage your Gradr account, preferences, and digest settings.",
  },
  "/affiliate": {
    title: "Affiliate Program",
    description: "Earn recurring commission by referring job seekers to Gradr — transparent rates and monthly payouts.",
  },
  "/affiliate/apply": {
    title: "Apply to the Affiliate Program",
    description: "Tell us about your audience and apply to become a Gradr affiliate partner.",
  },
  "/affiliate/dashboard": {
    title: "Affiliate Dashboard",
    description: "Track your referral clicks, conversions, commissions, and payouts as a Gradr affiliate.",
  },
  "/affiliate/resources": {
    title: "Affiliate Resources",
    description: "Campaign link builder, brand assets, and copy templates for Gradr affiliate partners.",
  },
  "/blog/ai-resume-optimization": {
    title: "AI Resume Builder & ATS Guide",
    description: "How AI resume builders help candidates beat Applicant Tracking Systems — keyword matching, formatting rules, and AI-driven rewrites.",
  },
  "/career-advice": {
    title: "Career Advice",
    description: "Free guides on resume optimization, cover letters, and interview preparation — practical advice for every stage of your job search.",
  },
  "/job-search": {
    title: "Job Search by Role & Location",
    description: "Browse job search pages by role, city, and remote preference, with the skills each role asks for and how to tailor your application.",
  },
};

/** Resolve metadata for dynamic content routes (guides and job landing pages). */
function resolveDynamicMeta(pathname: string): { title: string; description: string } | null {
  const guideSlug = pathname.startsWith("/career-advice/") ? pathname.slice(15) : null;
  if (guideSlug && GUIDES_BY_SLUG[guideSlug]) {
    const guide = GUIDES_BY_SLUG[guideSlug];
    return { title: guide.metaTitle, description: guide.description };
  }
  const jobSlug = pathname.startsWith("/job-search/") ? pathname.slice(12) : null;
  if (jobSlug && JOB_LANDINGS_BY_SLUG[jobSlug]) {
    const landing = JOB_LANDINGS_BY_SLUG[jobSlug];
    return { title: landing.metaTitle, description: landing.description };
  }
  return null;
}

export function RouteSeo() {
  const { pathname } = useLocation();
  const meta = META[pathname] ??
    resolveDynamicMeta(pathname) ?? {
      title: "AI Career Command Center",
      description: "Gradr is the AI career command center for job seekers — resume ATS scoring, job matching, instant applications, and realtime AI mock interviews.",
    };
  const fullTitle = pathname === "/" ? "Gradr | AI Career Command Center" : `${meta.title} — ${SITE}`;
  const url = `${ORIGIN}${pathname}`;
  const legalUpdated: Record<string, string> = {
    "/terms": POLICIES_UPDATED,
    "/privacy": POLICIES_UPDATED,
    "/refund-policy": POLICIES_UPDATED,
    "/cookie-policy": COOKIE_POLICY_EFFECTIVE,
    "/dpa": DPA_EFFECTIVE,
  };
  const legalLd = legalUpdated[pathname]
    ? legalJsonLd({
        path: pathname,
        name: meta.title,
        description: meta.description,
        lastUpdated: legalUpdated[pathname],
      })
    : null;
  const isArticle =
    pathname.startsWith("/career-advice/") || pathname.startsWith("/blog/");
  return (
    <Helmet>
      <html lang="en" />
      <title>{fullTitle}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      <link rel="alternate" hrefLang="en" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={isArticle ? "article" : "website"} />

      <meta property="og:site_name" content={SITE} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={OG_IMAGE} />
      {legalLd?.map((node, i) => (
        <script key={`legal-ld-${i}`} type="application/ld+json">
          {JSON.stringify(node)}
        </script>
      ))}
    </Helmet>
  );
}

