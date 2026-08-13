import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listResumes from "./tools/list-resumes";
import listTrackedJobs from "./tools/list-tracked-jobs";
import createTrackedJob from "./tools/create-tracked-job";
import listJobMatches from "./tools/list-job-matches";
import getProfile from "./tools/get-profile";

// Build the Supabase Auth issuer from the project ref so it always points at
// the direct supabase.co host, never the .lovable.cloud proxy. Vite inlines
// this literal at build time so the entry stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gradr-mcp",
  title: "Gradr",
  version: "0.1.0",
  instructions:
    "Tools for the signed-in Gradr user. Use `get_profile` for identity and career preferences, `list_resumes` and `list_job_matches` for AI resume + matching data, and `list_tracked_jobs` / `create_tracked_job` to read and write the user's job pipeline.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfile, listResumes, listJobMatches, listTrackedJobs, createTrackedJob],
});
