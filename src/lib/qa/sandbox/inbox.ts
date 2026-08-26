/**
 * Local e-mail capture ("test SMTP").
 *
 * When the e-mail sandbox is on, every transactional send and every password
 * reset request is written here instead of being delivered, so flows that
 * normally depend on a real mailbox (forgot password → reset link) can be
 * completed inside the browser.
 */
import { safeStorage } from "@/lib/safeStorage";

export interface CapturedEmail {
  id: string;
  capturedAt: string;
  to: string;
  from: string;
  subject: string;
  template: string | null;
  /** Plain-text or HTML preview body. */
  body: string;
  /** Actionable links pulled out of the message (reset, verify, etc.). */
  links: string[];
}

const KEY = "gradr.qa.sandbox.inbox";
const MAX = 50;

const listeners = new Set<(messages: CapturedEmail[]) => void>();

export function inboxMessages(): CapturedEmail[] {
  return safeStorage.getJSON<CapturedEmail[]>(KEY, []);
}

export function captureEmail(message: Omit<CapturedEmail, "id" | "capturedAt">): CapturedEmail {
  const entry: CapturedEmail = {
    ...message,
    id: `mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    capturedAt: new Date().toISOString(),
  };
  const next = [entry, ...inboxMessages()].slice(0, MAX);
  safeStorage.setJSON(KEY, next);
  listeners.forEach((fn) => fn(next));
  return entry;
}

export function clearInbox(): void {
  safeStorage.setJSON(KEY, []);
  listeners.forEach((fn) => fn([]));
}

export function onInboxChange(fn: (messages: CapturedEmail[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pulls http(s) links out of a rendered message body. */
export function extractLinks(body: string): string[] {
  const found = new Set<string>();
  const hrefs = body.matchAll(/href=["']([^"']+)["']/gi);
  for (const m of hrefs) found.add(m[1]);
  const bare = body.matchAll(/https?:\/\/[^\s"'<>)]+/gi);
  for (const m of bare) found.add(m[0]);
  return [...found].slice(0, 12);
}

/**
 * Password-reset link for the sandbox.
 *
 * No real recovery token exists (nothing was sent), so the link carries a
 * clearly-marked sandbox token. `/reset-password` still renders its full UI,
 * which is what this flow is meant to validate.
 */
export function sandboxResetLink(email: string, redirectTo?: string): string {
  const base = redirectTo || `${window.location.origin}/reset-password`;
  const url = new URL(base, window.location.origin);
  url.searchParams.set("qa_sandbox", "1");
  url.searchParams.set("qa_email", email);
  url.searchParams.set("qa_token", `sandbox-${Date.now().toString(36)}`);
  return url.toString();
}
