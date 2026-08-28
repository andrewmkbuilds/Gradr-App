// AUTO-DERIVED from .lovable/mcp/manifest.json — keep in sync (see src/test/mcpCatalog.test.ts).
export type McpToolInfo = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
};

export const MCP_SERVER = {"name": "gradr-mcp", "version": "0.2.0", "title": "Gradr"} as const;

export const MCP_TOOLS: McpToolInfo[] = [
  {
    name: "get_profile",
    title: "Get my Gradr profile",
    description: "Return the signed-in user's Gradr profile: name, email, target role, and career preferences.",
    readOnly: true,
  },
  {
    name: "get_credit_balance",
    title: "Get credit balance",
    description: "Return the signed-in user's remaining Gradr credits (application and interview credits) and their subscription tier.",
    readOnly: true,
  },
  {
    name: "list_resumes",
    title: "List resumes",
    description: "List the signed-in user's uploaded resumes with their ATS scores and AI analysis metadata.",
    readOnly: true,
  },
  {
    name: "list_job_matches",
    title: "List AI job matches",
    description: "List AI-generated job matches for the signed-in user, sorted by match score.",
    readOnly: true,
  },
  {
    name: "search_discovered_jobs",
    title: "Search the Gradr job feed",
    description: "Search jobs Gradr has discovered from its sourcing feeds by keyword, location or remote flag. Use create_tracked_job to save one to the pipeline.",
    readOnly: true,
  },
  {
    name: "list_tracked_jobs",
    title: "List tracked jobs",
    description: "List jobs the signed-in user is tracking in their Gradr pipeline, optionally filtered by status.",
    readOnly: true,
  },
  {
    name: "create_tracked_job",
    title: "Add tracked job",
    description: "Add a job opportunity to the signed-in user's Gradr pipeline.",
    readOnly: false,
  },
  {
    name: "update_tracked_job",
    title: "Update tracked job",
    description: "Update a job in the signed-in user's Gradr pipeline \u2014 move its status, add notes, or record the applied date.",
    readOnly: false,
  },
  {
    name: "list_job_reminders",
    title: "List job reminders",
    description: "List the signed-in user's follow-up reminders for tracked jobs, with due dates and completion state.",
    readOnly: true,
  },
  {
    name: "create_job_reminder",
    title: "Create job reminder",
    description: "Create a follow-up reminder for one of the signed-in user's tracked jobs.",
    readOnly: false,
  },
  {
    name: "list_interview_sessions",
    title: "List mock interview sessions",
    description: "List the signed-in user's completed AI mock interview sessions with scores, focus areas and target roles.",
    readOnly: true,
  },
  {
    name: "list_scheduled_interviews",
    title: "List scheduled interviews",
    description: "List the signed-in user's scheduled real interviews and calls, with company, role, time and status.",
    readOnly: true,
  },
  {
    name: "get_career_plan",
    title: "Get career plan",
    description: "Return the signed-in user's current AI-generated Gradr career plan: summary and the ordered list of steps.",
    readOnly: true,
  },
  {
    name: "list_notifications",
    title: "List notifications",
    description: "List the signed-in user's recent Gradr notifications, newest first.",
    readOnly: true,
  },
];
