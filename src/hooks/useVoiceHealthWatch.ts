import { useEffect, useRef, useState } from "react";
import { fetchVoiceHealth, type VoiceHealth } from "@/lib/interview/voiceStatus";

/**
 * Background recovery watch for the interviewer voice.
 *
 * When a turn dies because the *server's* voice credential is broken, rejected
 * or throttled, the candidate shouldn't have to reload to find out it came
 * back. While `active` is true this quietly re-reads voice health on a backing
 * off interval and calls `onRecovered` the moment the backend reports a
 * configured, entitled, healthy voice again — the interview itself is never
 * interrupted or restarted by the check.
 */

const FIRST_DELAY_MS = 8_000;
const MAX_DELAY_MS = 60_000;

export interface UseVoiceHealthWatchOptions {
  /** Poll only while the voice is down for a server-side reason. */
  active: boolean;
  onRecovered: (health: VoiceHealth) => void;
}

export function useVoiceHealthWatch({ active, onRecovered }: UseVoiceHealthWatchOptions) {
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const recoveredRef = useRef(onRecovered);
  recoveredRef.current = onRecovered;

  useEffect(() => {
    if (!active) {
      setAttempts(0);
      setChecking(false);
      return;
    }

    let cancelled = false;
    let timer = 0;
    let delay = FIRST_DELAY_MS;

    const run = async () => {
      if (cancelled) return;
      // Don't burn requests while the tab is in the background.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = window.setTimeout(run, delay);
        return;
      }

      setChecking(true);
      let health: VoiceHealth | null = null;
      try {
        health = await fetchVoiceHealth();
      } catch {
        health = null;
      }
      if (cancelled) return;

      setChecking(false);
      setLastCheckedAt(Date.now());
      setAttempts((n) => n + 1);

      if (health && health.configured && health.entitled && health.healthy) {
        recoveredRef.current(health);
        return;
      }

      delay = Math.min(Math.round(delay * 1.6), MAX_DELAY_MS);
      timer = window.setTimeout(run, delay);
    };

    timer = window.setTimeout(run, FIRST_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  return { checking, lastCheckedAt, attempts };
}
