/**
 * Network interception for the QA sandbox.
 *
 * A single `fetch` patch is enough: `supabase.functions.invoke`, the streamed
 * AI protocol and PostgREST all go through it. Each handler is gated on its own
 * flag, and anything not explicitly handled falls through to the real network.
 */
import { SUPABASE_FUNCTIONS_BASE, SUPABASE_PROJECT_URL } from "@/lib/supabaseEndpoints";
import { sandboxFlags } from "./flags";
import { fixtureAtsResult, fixtureJobScores, fixtureJobs, fixtureScrapedJobs } from "./fixtures";
import { captureEmail, extractLinks, sandboxResetLink } from "./inbox";
import {
  cancelSimulatedPlan,
  resumeSimulatedPlan,
  simulatedEntitlementSnapshot,
  simulatedSubscriberRow,
  simulatorState,
} from "./simulator";

const REST_BASE = `${SUPABASE_PROJECT_URL}/rest/v1`;
const AUTH_BASE = `${SUPABASE_PROJECT_URL}/auth/v1`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "x-qa-sandbox": "1" },
  });
}

/** SSE frame in the format `streamEdgeFunction` expects. */
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseResponse(frames: { event: string; data: unknown; delayMs?: number }[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const frame of frames) {
        if (frame.delayMs) await new Promise((r) => setTimeout(r, frame.delayMs));
        controller.enqueue(encoder.encode(sse(frame.event, frame.data)));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "x-qa-sandbox": "1" },
  });
}

async function readBody(init?: RequestInit, input?: RequestInfo | URL): Promise<Record<string, unknown>> {
  try {
    if (init?.body && typeof init.body === "string") return JSON.parse(init.body);
    if (input instanceof Request) return (await input.clone().json()) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return {};
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function headerOf(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string {
  const fromInit = new Headers(init?.headers ?? {}).get(name);
  if (fromInit) return fromInit;
  if (input instanceof Request) return input.headers.get(name) ?? "";
  return "";
}

/** Emulates PostgREST's single-object representation when asked for one. */
function restResult(rows: unknown[], accept: string): Response {
  if (accept.includes("pgrst.object")) {
    return rows.length ? jsonResponse(rows[0]) : jsonResponse({ message: "no rows" }, 406);
  }
  return jsonResponse(rows);
}

async function handleFunction(
  fn: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response | null> {
  const flags = sandboxFlags();
  const body = await readBody(init, input);

  if (flags.jobs) {
    if (fn === "search-jobs") {
      const { jobs, total } = fixtureJobs({
        what: String(body.what ?? ""),
        where: String(body.where ?? ""),
        page: Number(body.page ?? 1),
        remoteOnly: Boolean(body.remoteOnly),
      });
      return jsonResponse({ jobs, total, page: Number(body.page ?? 1), fixture: true, sources: { fixture: { count: jobs.length, status: "ok" } } });
    }
    if (fn === "jobs-apify") {
      return jsonResponse({ ok: true, fixture: true, jobs: fixtureScrapedJobs(String(body.query ?? ""), String(body.location ?? "")) });
    }
    if (fn === "recommend-jobs") {
      const count = Array.isArray(body.jobs) ? body.jobs.length : 0;
      return jsonResponse({ scores: fixtureJobScores(count), fixture: true });
    }
    if (fn === "match-jobs") {
      return jsonResponse({ matches: fixtureJobScores(5), fixture: true });
    }
  }

  if (flags.resume && fn === "analyze-resume") {
    const result = fixtureAtsResult(typeof body.jobTitle === "string" ? body.jobTitle : undefined);
    return sseResponse([
      { event: "stage", data: { key: "parse", label: "Parsing your resume", progress: 0.2 } },
      { event: "stage", data: { key: "score", label: "Scoring against ATS rules", progress: 0.55 }, delayMs: 120 },
      { event: "partial", data: { ...result, suggestions: [] }, delayMs: 60 },
      { event: "stage", data: { key: "coach", label: "Writing coaching notes", progress: 0.85 }, delayMs: 120 },
      { event: "result", data: result, delayMs: 60 },
      { event: "done", data: {} },
    ]);
  }

  if (flags.email && (fn === "send-transactional-email" || fn === "send-notification" || fn === "process-email-queue")) {
    const to = String(body.to ?? body.email ?? "qa@example.com");
    const rendered = String(body.html ?? body.body ?? body.message ?? "Captured by the QA sandbox.");
    const message = captureEmail({
      to,
      from: "job-ace-system <noreply@notify.app.gradr.me>",
      subject: String(body.subject ?? `[${String(body.template ?? fn)}]`),
      template: (body.template as string) ?? null,
      body: rendered,
      links: extractLinks(rendered),
    });
    return jsonResponse({ ok: true, captured: true, id: message.id });
  }

  if (flags.payments) {
    if (fn === "get-paddle-price") return jsonResponse({ paddleId: "pri_sandbox_fixture" });
    if (fn === "payments-portal") return jsonResponse({ url: `${window.location.origin}/qa/sandbox?portal=1` });
    if (fn === "payments-subscription") {
      const action = String(body.action ?? "");
      if (action === "cancel") cancelSimulatedPlan();
      if (action === "resume") resumeSimulatedPlan();
      const s = simulatorState();
      return jsonResponse({ ok: true, simulated: true, plan: s.plan, status: s.status, cancel_at_period_end: s.cancelAtPeriodEnd, current_period_end: s.currentPeriodEnd, transactions: [] });
    }
  }

  return null;
}

async function handleRest(
  path: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response | null> {
  if (!sandboxFlags().payments) return null;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const accept = headerOf(input, init, "Accept");
  const url = new URL(urlOf(input));
  const env = url.searchParams.get("environment")?.replace("eq.", "") ?? "sandbox";
  const userId = url.searchParams.get("user_id")?.replace("eq.", "") ?? "qa-user";
  const s = simulatorState();

  if (path.startsWith("rpc/entitlement_snapshot")) return jsonResponse(simulatedEntitlementSnapshot());
  if (method !== "GET") return null;
  if (path.startsWith("subscribers")) return restResult([simulatedSubscriberRow(userId, env)], accept);
  if (path.startsWith("usage_credits")) {
    return restResult([{ application_credits: s.applicationCredits, interview_credits: s.interviewCredits }], accept);
  }
  if (path.startsWith("purchases")) return restResult(s.purchases, accept);
  return null;
}

async function handleAuth(
  path: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response | null> {
  if (!sandboxFlags().email) return null;
  if (!path.startsWith("recover")) return null;

  const body = await readBody(init, input);
  const email = String(body.email ?? "qa@example.com");
  const url = new URL(urlOf(input));
  const link = sandboxResetLink(email, url.searchParams.get("redirect_to") ?? undefined);
  captureEmail({
    to: email,
    from: "job-ace-system <noreply@notify.app.gradr.me>",
    subject: "Reset your Gradr password",
    template: "auth_password_reset",
    body: `<p>Use the link below to choose a new password.</p><p><a href="${link}">Reset password</a></p>`,
    links: [link],
  });
  return jsonResponse({});
}

let installed = false;

/** Patches `window.fetch` once. Safe to call repeatedly. */
export function installNetworkSandbox(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url = urlOf(input);
      if (url.startsWith(SUPABASE_FUNCTIONS_BASE)) {
        const fn = url.slice(SUPABASE_FUNCTIONS_BASE.length + 1).split(/[?/]/)[0];
        const handled = await handleFunction(fn, input, init);
        if (handled) return handled;
      } else if (url.startsWith(REST_BASE)) {
        const handled = await handleRest(url.slice(REST_BASE.length + 1), input, init);
        if (handled) return handled;
      } else if (url.startsWith(AUTH_BASE)) {
        const handled = await handleAuth(url.slice(AUTH_BASE.length + 1), input, init);
        if (handled) return handled;
      }
    } catch (error) {
      // A sandbox bug must never break the app: fall through to the network.
      console.warn("[qa-sandbox] interception failed, using the real request", error);
    }
    return original(input as RequestInfo, init);
  };
}
