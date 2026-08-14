/**
 * Activation helpers.
 *
 * "First" milestones are the ones activation funnels are built on, so they must
 * fire exactly once per account — not once per page load. The marker is stored
 * per user id so a shared device cannot suppress another account's milestone.
 */
import { safeStorage } from "@/lib/safeStorage";
import { track, type EventProps, type GradrEvent } from "./events";

function markerKey(event: string, userId: string) {
  return `gradr_milestone:${event}:${userId}`;
}

/** Fires `event` only the first time it happens for this account. */
export function trackFirstTime(event: GradrEvent, userId: string | undefined, props: EventProps = {}) {
  if (!userId) return;
  const key = markerKey(event, userId);
  if (safeStorage.get(key)) return;
  safeStorage.set(key, new Date().toISOString());
  track(event, props);
}

/** Job saved, plus the once-per-account activation milestone. */
export function trackJobSaved(
  userId: string | undefined,
  props: { source?: string; match_score?: number; has_salary?: boolean; remote?: boolean } = {},
) {
  track("job_saved", props);
  trackFirstTime("first_job_saved", userId, props);
}
