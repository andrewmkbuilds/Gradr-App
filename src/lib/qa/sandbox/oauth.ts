/**
 * Mocked OAuth provider round-trip.
 *
 * The real managed OAuth handshake needs live Google/Apple/Microsoft clients.
 * In sandbox mode the app instead bounces through `/qa/oauth`, which plays the
 * provider's role deterministically: it records the hop, then redirects back to
 * exactly the URL the app asked for.
 *
 * A session is only created when a QA account (e-mail + password) is configured
 * on the sandbox page. Without one the redirect chain is still fully
 * verifiable, and the sandbox says plainly that no session was created rather
 * than faking one.
 */
import { supabase } from "@/integrations/supabase/client";
import { safeStorage } from "@/lib/safeStorage";
import { lovable } from "@/integrations/lovable";
import { sandboxFlags } from "./flags";

export type MockProvider = "google" | "apple" | "microsoft" | "lovable";

export interface OAuthHopRecord {
  at: string;
  provider: MockProvider;
  stage: "start" | "callback" | "session" | "error";
  detail: string;
}

const CREDENTIALS_KEY = "gradr.qa.sandbox.oauth-account";
const LOG_KEY = "gradr.qa.sandbox.oauth-log";

export interface QaAccount {
  email: string;
  password: string;
}

export function qaAccount(): QaAccount | null {
  const value = safeStorage.getJSON<QaAccount | null>(CREDENTIALS_KEY, null);
  return value?.email && value?.password ? value : null;
}

export function setQaAccount(account: QaAccount | null): void {
  if (account) safeStorage.setJSON(CREDENTIALS_KEY, account);
  else safeStorage.remove(CREDENTIALS_KEY);
}

export function oauthLog(): OAuthHopRecord[] {
  return safeStorage.getJSON<OAuthHopRecord[]>(LOG_KEY, []);
}

export function recordHop(entry: Omit<OAuthHopRecord, "at">): void {
  const next = [{ ...entry, at: new Date().toISOString() }, ...oauthLog()].slice(0, 40);
  safeStorage.setJSON(LOG_KEY, next);
}

export function clearOauthLog(): void {
  safeStorage.setJSON(LOG_KEY, []);
}

/**
 * Drop-in replacement for `lovable.auth.signInWithOAuth`. Falls straight
 * through to the real provider unless the OAuth sandbox is on.
 */
export async function signInWithOAuthMaybeMocked(
  provider: MockProvider,
  opts?: { redirect_uri?: string },
): Promise<{ error?: Error | null; redirected?: boolean }> {
  if (!sandboxFlags().oauth) return lovable.auth.signInWithOAuth(provider, opts);

  const redirect = opts?.redirect_uri ?? `${window.location.origin}/dashboard`;
  recordHop({ provider, stage: "start", detail: `mock consent requested, will return to ${redirect}` });
  const url = new URL("/qa/oauth", window.location.origin);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect", redirect);
  window.location.assign(url.toString());
  return { redirected: true };
}

/** Called by the mock provider page once "consent" is granted. */
export async function completeMockedOAuth(
  provider: MockProvider,
  redirect: string,
): Promise<{ sessionCreated: boolean; message: string }> {
  const account = qaAccount();
  if (!account) {
    recordHop({ provider, stage: "callback", detail: "no QA account configured — redirect verified, no session created" });
    return {
      sessionCreated: false,
      message: "Redirect verified. No QA account is configured, so no session was created.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword(account);
  if (error) {
    recordHop({ provider, stage: "error", detail: error.message });
    return { sessionCreated: false, message: `Sign-in failed: ${error.message}` };
  }
  recordHop({ provider, stage: "session", detail: `session created for ${account.email}` });
  return { sessionCreated: true, message: `Signed in as ${account.email}.` };
}

/** Final leg: back to the app exactly where the real provider would land. */
export function mockedCallbackUrl(provider: MockProvider, redirect: string): string {
  const url = new URL(redirect, window.location.origin);
  url.searchParams.set("qa_oauth", provider);
  return url.toString();
}
