/**
 * Documentation registry for docs.gradr.me.
 *
 * Plain data only (no React imports) so the sitemap generator can import it
 * from Node. Every docs page, the docs sidebar, search and the sitemap are
 * generated from this single source of truth.
 */

export interface DocSection {
  heading: string;
  body: string[];
  list?: string[];
}

export interface DocArticle {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  category: DocCategory;
  updated: string;
  sections: DocSection[];
}

export type DocCategory =
  | "Getting started"
  | "Features"
  | "AI Mock Interview"
  | "Account & billing"
  | "Developers"
  | "Help";

export const DOC_CATEGORIES: DocCategory[] = [
  "Getting started",
  "Features",
  "AI Mock Interview",
  "Account & billing",
  "Developers",
  "Help",
];

export const DOCS: DocArticle[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    metaTitle: "Gradr Quickstart — Set Up Your Career Workspace",
    description:
      "Create your Gradr account, upload a resume, and run your first ATS scan, job match and mock interview in under ten minutes.",
    category: "Getting started",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Create your account",
        body: [
          "Sign up with email and password or continue with Google. Email accounts must confirm their address before the workspace unlocks; Google accounts are active immediately.",
          "If you started as a guest, use Create account on the auth screen — your guest data (resumes, matches, pipeline) is upgraded in place and nothing is lost.",
        ],
      },
      {
        heading: "Upload your first resume",
        body: [
          "Open Resume Intelligence and drop in a PDF or DOCX. Gradr extracts the text, parses your sections and produces an ATS score with a breakdown per pillar.",
        ],
        list: [
          "Single-column layouts parse most reliably",
          "Avoid text inside images, tables and headers/footers",
          "Use standard section names: Experience, Education, Skills",
        ],
      },
      {
        heading: "Run the core loop",
        body: [
          "Gradr is built around one loop: score, match, apply, practice. Score your resume, match it against a live role, generate tailored application materials, then rehearse the interview with the AI coach.",
        ],
      },
    ],
  },
  {
    slug: "workspace-tour",
    title: "Workspace tour",
    metaTitle: "Gradr Workspace Tour — Navigation & Modules",
    description:
      "A map of the Gradr workspace: dashboard, career engines, interview studio, growth tools, analytics and settings.",
    category: "Getting started",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Navigation groups",
        body: ["The sidebar groups everything into six areas."],
        list: [
          "Dashboard — career readiness score, next actions, your 3-day plan",
          "Career — resume, job feed, matching, pipeline, application engine",
          "Interview — AI Mock Interview studio and interview history",
          "Growth — skill gap analysis and roadmap",
          "Account — settings, billing, preferences",
          "More — legal, help, affiliate program",
        ],
      },
      {
        heading: "Career readiness score",
        body: [
          "The dashboard score aggregates resume quality, pipeline health, interview practice and skill coverage. Expand Why this score to see each pillar's contribution and the fastest way to move it.",
        ],
      },
    ],
  },
  {
    slug: "resume-intelligence",
    title: "Resume Intelligence",
    metaTitle: "Resume Intelligence Documentation — ATS Scoring in Gradr",
    description:
      "How Gradr parses resumes, calculates ATS scores, generates rewrite suggestions and compares resume versions.",
    category: "Features",
    updated: "2026-08-01",
    sections: [
      {
        heading: "How scoring works",
        body: [
          "Scoring is deterministic: the same resume and job description always produce the same score. Gradr evaluates parseability, keyword coverage, impact language, structure and length, then weights them into a single 0–100 ATS score.",
        ],
      },
      {
        heading: "Suggestions",
        body: [
          "Each suggestion carries a severity (critical, important, polish), the exact line it applies to and a concrete next action. Applying a suggestion re-scores the resume immediately.",
        ],
      },
      {
        heading: "Version comparison",
        body: [
          "Every save creates a version. Open the comparison view to diff two versions line by line and see how the score moved between them.",
        ],
      },
    ],
  },
  {
    slug: "job-matching",
    title: "Job matching",
    metaTitle: "Job Matching Documentation — Gradr Match Scores",
    description:
      "Match your resume against live roles, understand match scores, and turn gaps into an application strategy.",
    category: "Features",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Live roles",
        body: [
          "The job feed pulls real listings and ranks them against your profile. Filters cover role, location, remote preference and seniority.",
        ],
      },
      {
        heading: "Reading a match score",
        body: [
          "A match score combines hard-skill overlap, title proximity, seniority fit and location compatibility. The gap panel lists the missing keywords worth adding — only where you can back them with real experience.",
        ],
      },
    ],
  },
  {
    slug: "application-tracking",
    title: "Application tracking",
    metaTitle: "Application Tracking Documentation — Gradr Pipeline",
    description:
      "Track every application through the Gradr pipeline, with stages, follow-up reminders and response analytics.",
    category: "Features",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Stages",
        body: [
          "Applications move through Saved, Applied, Interviewing, Offer and Closed. Drag a card to change stage; the timestamp of each transition is stored for analytics.",
        ],
      },
      {
        heading: "Follow-up reminders",
        body: [
          "Configure a reminder cadence per stage. Gradr surfaces due follow-ups on the dashboard and can email you a daily digest.",
        ],
      },
    ],
  },
  {
    slug: "ai-mock-interview",
    title: "AI Mock Interview overview",
    metaTitle: "AI Mock Interview Documentation — Voice Interviews in Gradr",
    description:
      "How Gradr's voice-based AI mock interview works: setup, live captions, barge-in, scoring and the exportable scorecard.",
    category: "AI Mock Interview",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Starting a session",
        body: [
          "Pick a role, seniority, interview type (behavioural, technical, mixed) and duration. Grant microphone access when prompted — audio is streamed for transcription and never stored unless you enable recording.",
        ],
      },
      {
        heading: "During the interview",
        body: [
          "The interviewer speaks with natural voice output while captions reveal progressively in sync with the audio. You can interrupt at any time (barge-in) and the interviewer will stop and listen.",
        ],
      },
      {
        heading: "Scorecard",
        body: [
          "At the end you get per-competency scores, strengths, gaps and a full searchable transcript. Export as PDF, or export the transcript alone as text.",
        ],
      },
    ],
  },
  {
    slug: "interview-troubleshooting",
    title: "Interview troubleshooting",
    metaTitle: "AI Mock Interview Troubleshooting — Audio & Connection Fixes",
    description:
      "Fix microphone permission, audio playback, connection drop and caption sync issues in the Gradr AI Mock Interview.",
    category: "AI Mock Interview",
    updated: "2026-08-01",
    sections: [
      {
        heading: "No microphone input",
        body: [
          "Check the browser site permissions and confirm the correct input device is selected in your OS settings. Safari requires the tab to be in the foreground.",
        ],
      },
      {
        heading: "Connection lost",
        body: [
          "The studio shows a reconnection overlay and retries the current turn automatically. If the session cannot recover, your transcript up to that point is saved and the session appears in Interview History.",
        ],
      },
      {
        heading: "Captions out of sync",
        body: [
          "Captions are timed to audio playback. If you mute the tab, captions continue at the estimated speech rate. Reloading the page ends the session cleanly rather than resuming.",
        ],
      },
    ],
  },
  {
    slug: "billing",
    title: "Plans & billing",
    metaTitle: "Gradr Billing Documentation — Plans, Invoices & Cancellation",
    description:
      "Gradr plans, monthly vs yearly billing, upgrades and downgrades, invoices, refunds and how to cancel.",
    category: "Account & billing",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Plans",
        body: [
          "Free, Starter, Pro and Advanced. Each tier raises the monthly allowance for AI actions (resume scans, matches, generated documents, interview minutes). Usage bars in Settings show what's left in the current period.",
        ],
      },
      {
        heading: "Payments",
        body: [
          "Payments are processed by Paddle as merchant of record. Invoices, tax receipts, payment method updates and cancellation all live in the billing portal, reachable from Billing in the app.",
        ],
      },
      {
        heading: "Changing plans",
        body: [
          "Upgrades apply immediately and are prorated. Downgrades take effect at the end of the current billing period so you keep what you paid for.",
        ],
      },
    ],
  },
  {
    slug: "account-and-data",
    title: "Account & data controls",
    metaTitle: "Gradr Account & Data Documentation — Export and Deletion",
    description:
      "Manage your Gradr account: profile, notification preferences, data export and permanent account deletion.",
    category: "Account & billing",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Export your data",
        body: [
          "Settings → Privacy exports a machine-readable archive of your profile, resumes, applications, interview transcripts and scores.",
        ],
      },
      {
        heading: "Delete your account",
        body: [
          "Deletion is permanent and removes stored resumes, transcripts and analytics tied to your account. Active subscriptions should be cancelled first so billing stops cleanly.",
        ],
      },
    ],
  },
  {
    slug: "api",
    title: "API & agent integrations",
    metaTitle: "Gradr API & MCP Documentation for Agent Integrations",
    description:
      "Connect agents to Gradr with the MCP server: OAuth 2.1 authorisation, available tools and user-scoped permissions.",
    category: "Developers",
    updated: "2026-08-01",
    sections: [
      {
        heading: "MCP server",
        body: [
          "Gradr exposes a Model Context Protocol server so agent clients can read and act on your career data with your explicit consent.",
        ],
        list: [
          "Authorisation: OAuth 2.1 with PKCE and an explicit consent screen",
          "Scope: every tool is user-scoped — an agent only ever sees the authorising account's data",
          "Revocation: revoke a client at any time from Settings",
        ],
      },
      {
        heading: "Available tools",
        body: ["The server exposes read and action tools over your workspace."],
        list: [
          "list_applications — pipeline entries with stage and timestamps",
          "score_resume — ATS score for a stored resume",
          "match_job — score a stored resume against a job description",
          "list_interviews — past mock interview sessions and scores",
          "create_application — add a role to the pipeline",
        ],
      },
    ],
  },
  {
    slug: "faq",
    title: "FAQ",
    metaTitle: "Gradr FAQ — Common Questions Answered",
    description:
      "Answers to the most common Gradr questions about data privacy, AI accuracy, supported file types and cancellation.",
    category: "Help",
    updated: "2026-08-01",
    sections: [
      {
        heading: "Is my resume data used to train AI models?",
        body: ["No. Your documents and transcripts are used only to produce your results."],
      },
      {
        heading: "Which file types are supported?",
        body: ["PDF and DOCX for resumes. Plain text can be pasted directly."],
      },
      {
        heading: "Can I cancel any time?",
        body: [
          "Yes. Cancelling stops the next renewal and keeps access until the end of the paid period.",
        ],
      },
      {
        heading: "Does Gradr work outside the US?",
        body: [
          "Yes. Job matching supports international locations and remote roles, and pricing is charged in your local currency where Paddle supports it.",
        ],
      },
    ],
  },
];

export const DOCS_BY_SLUG: Record<string, DocArticle> = Object.fromEntries(
  DOCS.map((doc) => [doc.slug, doc]),
);

export function docPath(slug: string): string {
  return `/${slug}`;
}
