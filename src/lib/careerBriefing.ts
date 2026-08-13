/**
 * Career Briefing engine.
 *
 * Pure, deterministic logic that turns a user's raw career data (resume health,
 * pipeline, matches, reminders) into:
 *   - a single "Career Readiness" score users can move day to day
 *   - a ranked list of next-best actions with a reason and a destination
 *
 * Deliberately dependency-free so it stays testable and can run on the server
 * later (digest emails, notifications) without touching React.
 */

export interface BriefingInput {
  resumeScore: number;
  keywordMatch: number;
  formattingScore: number;
  impactScore: number;
  totalResumes: number;
  totalMatches: number;
  highConfidence: number;
  appliedThisWeek: number;
  stages: { saved: number; applied: number; interview: number; offer: number; rejected: number };
  overdueCount: number;
  nextReminderTitle?: string | null;
  interviewSessions: number;
  lastInterviewAt?: string | null;
}

export type ActionTone = "critical" | "primary" | "steady";

export interface NextAction {
  id: string;
  label: string;
  reason: string;
  to: string;
  cta: string;
  tone: ActionTone;
  /** Higher wins. */
  weight: number;
}

export interface ReadinessSignal {
  /** The exact data point that fed the component. */
  label: string;
  value: string;
}

export interface ReadinessBreakdown {
  key: string;
  label: string;
  value: number;
  weight: number;
  hint: string;
  /** Plain-English description of how the component is calculated. */
  formula: string;
  /** The raw signals behind the number, for the "why this score" panel. */
  signals: ReadinessSignal[];
  /** What the user can do to move this component. */
  lever: { label: string; to: string };
}

export interface Briefing {
  readiness: number;
  breakdown: ReadinessBreakdown[];
  headline: string;
  summary: string;
  actions: NextAction[];
  isNewUser: boolean;
  weeklyGoal: { applied: number; target: number; pct: number };
}

const WEEKLY_TARGET = 5;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Time-of-day greeting; hour is injectable for deterministic tests. */
export function greeting(hour = new Date().getHours()) {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function buildBriefing(input: BriefingInput): Briefing {
  const { stages } = input;
  const pipelineActive = stages.saved + stages.applied + stages.interview + stages.offer;
  const isNewUser = input.totalResumes === 0 && pipelineActive === 0 && input.totalMatches === 0;

  // --- readiness -----------------------------------------------------------
  const resumeHealth = input.resumeScore;
  const targeting = input.totalMatches === 0 ? 0 : clamp((input.highConfidence / input.totalMatches) * 100);
  const momentum = clamp((Math.min(input.appliedThisWeek, WEEKLY_TARGET) / WEEKLY_TARGET) * 100);
  const interviewPrep = clamp(Math.min(input.interviewSessions, 4) * 25);

  const breakdown: ReadinessBreakdown[] = [
    {
      key: "resume",
      label: "Resume health",
      value: resumeHealth,
      weight: 0.35,
      hint: "Latest ATS score",
      formula: "The ATS score of your most recently analysed resume, taken as-is.",
      signals: [
        { label: "Resumes analysed", value: String(input.totalResumes) },
        { label: "Latest ATS score", value: input.totalResumes > 0 ? `${clamp(input.resumeScore)}/100` : "no resume yet" },
        { label: "Keyword coverage", value: `${clamp(input.keywordMatch)}%` },
        { label: "Formatting", value: `${clamp(input.formattingScore)}%` },
        { label: "Impact statements", value: `${clamp(input.impactScore)}%` },
      ],
      lever: { label: input.totalResumes === 0 ? "Upload a resume" : "Optimise your resume", to: "/resume" },
    },
    {
      key: "targeting",
      label: "Job targeting",
      value: targeting,
      weight: 0.25,
      hint: "Share of strong matches",
      formula: "Matches scoring 85%+ against your resume, divided by all matches found.",
      signals: [
        { label: "Matches found", value: String(input.totalMatches) },
        { label: "Strong matches (85%+)", value: String(input.highConfidence) },
        {
          label: "Strong share",
          value: input.totalMatches === 0 ? "no matches yet" : `${targeting}%`,
        },
      ],
      lever: { label: "Refine your targeting", to: "/onboarding" },
    },
    {
      key: "momentum",
      label: "Weekly momentum",
      value: momentum,
      weight: 0.2,
      hint: `${input.appliedThisWeek}/${WEEKLY_TARGET} applications`,
      formula: `Applications sent in the last 7 days against a weekly target of ${WEEKLY_TARGET}, capped at 100%.`,
      signals: [
        { label: "Applied in last 7 days", value: String(input.appliedThisWeek) },
        { label: "Weekly target", value: String(WEEKLY_TARGET) },
        { label: "Open follow-ups overdue", value: String(input.overdueCount) },
        { label: "Roles in pipeline", value: String(pipelineActive) },
      ],
      lever: { label: "Find roles to apply to", to: "/jobs" },
    },
    {
      key: "prep",
      label: "Interview prep",
      value: interviewPrep,
      weight: 0.2,
      hint: `${input.interviewSessions} mock sessions`,
      formula: "25 points per completed mock interview, capped at 4 sessions.",
      signals: [
        { label: "Mock sessions completed", value: String(input.interviewSessions) },
        {
          label: "Last session",
          value: input.lastInterviewAt ? new Date(input.lastInterviewAt).toLocaleDateString() : "never",
        },
        { label: "Roles at interview stage", value: String(stages.interview) },
      ],
      lever: { label: "Run a mock interview", to: "/interview" },
    },
  ];

  const readiness = clamp(breakdown.reduce((sum, b) => sum + b.value * b.weight, 0));

  // --- actions -------------------------------------------------------------
  const actions: NextAction[] = [];

  if (input.overdueCount > 0) {
    actions.push({
      id: "overdue",
      label: `Clear ${input.overdueCount} overdue follow-up${input.overdueCount > 1 ? "s" : ""}`,
      reason: "Follow-ups sent within 5 days meaningfully lift reply rates.",
      to: "/pipeline",
      cta: "Open pipeline",
      tone: "critical",
      weight: 100,
    });
  }

  if (input.totalResumes === 0) {
    actions.push({
      id: "upload-resume",
      label: "Upload your resume",
      reason: "Everything else — matching, tailoring, interview prep — builds on it.",
      to: "/resume",
      cta: "Add resume",
      tone: "primary",
      weight: 95,
    });
  } else if (resumeHealth < 75) {
    const weakest = [
      { label: "keyword coverage", v: input.keywordMatch, to: "/resume" },
      { label: "formatting", v: input.formattingScore, to: "/resume" },
      { label: "impact statements", v: input.impactScore, to: "/resume" },
    ].sort((a, b) => a.v - b.v)[0]!;
    actions.push({
      id: "fix-resume",
      label: `Improve ${weakest.label}`,
      reason: `It's your weakest ATS signal at ${clamp(weakest.v)}% — the fastest way to raise your score.`,
      to: weakest.to,
      cta: "Optimise resume",
      tone: "primary",
      weight: 88,
    });
  }

  if (stages.interview > 0) {
    actions.push({
      id: "prep-interview",
      label: `Prep for ${stages.interview} live interview${stages.interview > 1 ? "s" : ""}`,
      reason: "Run a mock round and get a scorecard before the real thing.",
      to: "/interview",
      cta: "Start mock interview",
      tone: "critical",
      weight: 92,
    });
  } else if (input.interviewSessions === 0 && stages.applied > 0) {
    actions.push({
      id: "first-mock",
      label: "Run your first mock interview",
      reason: "You have applications live — be ready before the first callback lands.",
      to: "/interview",
      cta: "Start mock interview",
      tone: "steady",
      weight: 70,
    });
  }

  if (input.totalMatches === 0) {
    actions.push({
      id: "find-jobs",
      label: "Find roles that match your profile",
      reason: "We rank real openings against your resume, not keywords alone.",
      to: "/jobs",
      cta: "Browse matches",
      tone: "primary",
      weight: 85,
    });
  } else if (input.highConfidence > 0 && input.appliedThisWeek < WEEKLY_TARGET) {
    actions.push({
      id: "apply-high",
      label: `Apply to ${input.highConfidence} strong match${input.highConfidence > 1 ? "es" : ""}`,
      reason: "These score 85%+ against your resume — your best odds this week.",
      to: "/jobs",
      cta: "Review matches",
      tone: "primary",
      weight: 80,
    });
  }

  if (stages.saved >= 3 && stages.applied === 0) {
    actions.push({
      id: "convert-saved",
      label: `Turn ${stages.saved} saved jobs into applications`,
      reason: "Generate a tailored pack per role in a couple of clicks.",
      to: "/apply",
      cta: "Open application engine",
      tone: "steady",
      weight: 72,
    });
  }

  if (actions.length < 3 && input.appliedThisWeek < WEEKLY_TARGET) {
    actions.push({
      id: "weekly-goal",
      label: `Hit your weekly goal — ${WEEKLY_TARGET - input.appliedThisWeek} to go`,
      reason: "Consistent weekly volume beats one perfect application.",
      to: "/jobs",
      cta: "Find roles",
      tone: "steady",
      weight: 50,
    });
  }

  if (actions.length < 3) {
    actions.push({
      id: "career-plan",
      label: "Review your career roadmap",
      reason: "See the skill gaps standing between you and your target role.",
      to: "/growth",
      cta: "Open roadmap",
      tone: "steady",
      weight: 40,
    });
  }

  actions.sort((a, b) => b.weight - a.weight);

  // --- narrative -----------------------------------------------------------
  let headline: string;
  let summary: string;
  if (isNewUser) {
    headline = "Let's set up your career OS";
    summary = "Three quick steps and Gradr starts working in the background for you.";
  } else if (input.overdueCount > 0) {
    headline = "You have follow-ups slipping";
    summary = `${input.overdueCount} reminder${input.overdueCount > 1 ? "s are" : " is"} past due. Clear those first, then keep momentum.`;
  } else if (stages.interview > 0) {
    headline = "Interviews are on the board";
    summary = `${stages.interview} role${stages.interview > 1 ? "s are" : " is"} at interview stage. Prep beats hope.`;
  } else if (readiness >= 75) {
    headline = "You're in strong shape";
    summary = "Readiness is high — the job now is volume and consistency.";
  } else if (input.appliedThisWeek === 0) {
    headline = "No applications yet this week";
    summary = "One focused hour today puts you back ahead of the median candidate.";
  } else {
    headline = "Steady progress";
    summary = `${input.appliedThisWeek} application${input.appliedThisWeek > 1 ? "s" : ""} out this week. Here's what moves the needle next.`;
  }

  return {
    readiness,
    breakdown,
    headline,
    summary,
    actions: actions.slice(0, 3),
    isNewUser,
    weeklyGoal: {
      applied: input.appliedThisWeek,
      target: WEEKLY_TARGET,
      pct: clamp((Math.min(input.appliedThisWeek, WEEKLY_TARGET) / WEEKLY_TARGET) * 100),
    },
  };
}

export interface SetupStep {
  id: string;
  label: string;
  description: string;
  to: string;
  done: boolean;
}

export function setupSteps(input: BriefingInput): SetupStep[] {
  const pipeline = input.stages.saved + input.stages.applied + input.stages.interview + input.stages.offer;
  return [
    {
      id: "resume",
      label: "Add your resume",
      description: "We score it against ATS rules and extract your skill profile.",
      to: "/resume",
      done: input.totalResumes > 0,
    },
    {
      id: "match",
      label: "Match against real roles",
      description: "Live openings ranked against your actual experience.",
      to: "/jobs",
      done: input.totalMatches > 0,
    },
    {
      id: "track",
      label: "Track your first application",
      description: "Pipeline stages, follow-up reminders, and outcome tracking.",
      to: "/pipeline",
      done: pipeline > 0,
    },
    {
      id: "interview",
      label: "Run a mock interview",
      description: "Voice-first AI coach with a scorecard and a 7-day plan.",
      to: "/interview",
      done: input.interviewSessions > 0,
    },
  ];
}
