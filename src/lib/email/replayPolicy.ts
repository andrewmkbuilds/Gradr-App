/**
 * Dead-letter replay rules, kept pure so they can be tested without a database.
 *
 * A dead-lettered email has already been rendered and attempted; replaying it
 * must never be able to produce a second delivery. Both the key namespace and
 * the eligibility decision live here so the server handler and the tests agree
 * on exactly one definition.
 */

/** Idempotency key claimed before a replay is enqueued. One per message, ever. */
export function replayKeyFor(messageId: string): string {
  return `dlq-replay:${messageId}`;
}

/** Message id used for the replayed copy, derived (not random) so it is stable. */
export function replayMessageIdFor(messageId: string): string {
  return `${messageId}:replay`;
}

export type ReplayDecision =
  | { allowed: true; replayKey: string; replayMessageId: string }
  | { allowed: false; reason: string; idempotent: boolean };

/**
 * @param status         latest known status of the original message
 * @param keyAlreadyHeld true when the idempotency key insert lost the race
 */
export function decideReplay(
  messageId: string,
  status: string | null | undefined,
  keyAlreadyHeld: boolean,
): ReplayDecision {
  if (!messageId) {
    return { allowed: false, reason: "messageId is required", idempotent: false };
  }
  if (status !== "dlq") {
    return {
      allowed: false,
      reason: `Only dead-lettered messages can be replayed (state: ${status ?? "unknown"})`,
      idempotent: false,
    };
  }
  if (keyAlreadyHeld) {
    return { allowed: false, reason: "Already replayed once", idempotent: true };
  }
  return {
    allowed: true,
    replayKey: replayKeyFor(messageId),
    replayMessageId: replayMessageIdFor(messageId),
  };
}
