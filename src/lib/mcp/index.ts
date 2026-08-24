import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listResumes from "./tools/list-resumes";
import listTrackedJobs from "./tools/list-tracked-jobs";
import createTrackedJob from "./tools/create-tracked-job";
import updateTrackedJob from "./tools/update-tracked-job";
import listJobMatches from "./tools/list-job-matches";
import getProfile from "./tools/get-profile";
import listInterviewSessions from "./tools/list-interview-sessions";
import getCareerPlan from "./tools/get-career-plan";
import listScheduledInterviews from "./tools/list-scheduled-interviews";
import getCreditBalance from "./tools/get-credit-balance";
import searchDiscoveredJobs from "./tools/search-discovered-jobs";
import listJobReminders from "./tools/list-job-reminders";
import createJobReminder from "./tools/create-job-reminder";
import listNotifications from "./tools/list-notifications";

// Build the Supabase Auth issuer from the project ref so it always points at
// the direct supabase.co host, never the .lovable.cloud proxy. Vite inlines
// this literal at build time so the entry stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gradr-mcp",
  title: "Gradr",
  version: "0.2.0",
  instructions:
    "Tools for the signed-in Gradr user. Identity and preferences: `get_profile`, `get_credit_balance`. Resumes and matching: `list_resumes`, `list_job_matches`. Job pipeline: `search_discovered_jobs` to find roles, `create_tracked_job` to save one, `list_tracked_jobs` and `update_tracked_job` to read and move them, `list_job_reminders` / `create_job_reminder` for follow-ups. Interviews and growth: `list_interview_sessions` for AI mock interview feedback, `list_scheduled_interviews` for real upcoming interviews, `get_career_plan` for the user's plan. `list_notifications` surfaces recent activity.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getProfile,
    getCreditBalance,
    listResumes,
    listJobMatches,
    searchDiscoveredJobs,
    listTrackedJobs,
    createTrackedJob,
    updateTrackedJob,
    listJobReminders,
    createJobReminder,
    listInterviewSessions,
    listScheduledInterviews,
    getCareerPlan,
    listNotifications,
  ],
});
