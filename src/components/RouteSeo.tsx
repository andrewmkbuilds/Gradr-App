import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const SITE = "CareerFlow OS";
const ORIGIN = "https://careerflowos.lovable.app";

const META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Dashboard",
    description: "Your CareerFlow OS dashboard — pipeline overview, AI scores, reminders, and quick actions.",
  },
  "/auth": {
    title: "Sign in",
    description: "Sign in or create your CareerFlow OS account to access your AI career command center.",
  },
  "/forgot-password": {
    title: "Forgot password",
    description: "Reset your CareerFlow OS password and get back to your career workflow.",
  },
  "/reset-password": {
    title: "Reset password",
    description: "Choose a new password for your CareerFlow OS account.",
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
  "/growth": {
    title: "Growth Engine",
    description: "AI skill gap analysis and a personalized roadmap to your next role.",
  },
  "/pricing": {
    title: "Pricing",
    description: "Simple plans for every job seeker — start free, upgrade when you need more AI power.",
  },
  "/settings": {
    title: "Settings",
    description: "Manage your CareerFlow OS account, preferences, and digest settings.",
  },
};

export function RouteSeo() {
  const { pathname } = useLocation();
  const meta = META[pathname] ?? {
    title: "CareerFlow OS",
    description: "AI resume analysis, job matching, application generation, and interview coaching in one platform.",
  };
  const fullTitle = pathname === "/" ? `${SITE} — AI Career Command Center` : `${meta.title} — ${SITE}`;
  const url = `${ORIGIN}${pathname}`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={meta.description} />
    </Helmet>
  );
}
