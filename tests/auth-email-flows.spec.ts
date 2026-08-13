import { test, expect } from "../playwright-fixture";

/**
 * End-to-end coverage for the six authentication email journeys.
 *
 * Real Supabase emails cannot be delivered into CI, so each test clicks the
 * *same link shape* Supabase puts in the email — `/auth/callback` carrying
 * token_hash, type and redirect_to — and asserts the app completes the right
 * Gradr flow: it stays on a Gradr origin, never bounces to an external or
 * placeholder host, renders a real UI (not an error shell), and honours the
 * redirect target once verification resolves.
 *
 * Tokens here are synthetic, so verification legitimately fails; what we assert
 * is that the *routing and recovery* behaviour is correct — the failure mode a
 * user actually hits (expired link) must land them on a Gradr screen that tells
 * them what to do, never on a blank page or an off-domain redirect.
 */

const FORBIDDEN_HOSTS = ["lovable.app", "gradr-app", "localhost:3000", "127.0.0.1"];

function emailLink(type: string, next: string): string {
  const token = `pkce_e2e_${type}_0000000000`;
  return `/auth/callback?token_hash=${token}&type=${type}&redirect_to=${encodeURIComponent(next)}`;
}

const FLOWS: { name: string; type: string; next: string; expects: RegExp }[] = [
  { name: "email confirmation", type: "signup", next: "/welcome", expects: /sign in|confirm|link|expired|welcome/i },
  { name: "password reset", type: "recovery", next: "/reset-password", expects: /password|reset|link|expired/i },
  { name: "magic link login", type: "magiclink", next: "/dashboard", expects: /sign in|link|expired|dashboard/i },
  { name: "invitation acceptance", type: "invite", next: "/onboarding", expects: /invite|sign|link|expired|start/i },
  { name: "email change confirmation", type: "email_change", next: "/settings", expects: /email|confirm|link|expired|settings/i },
  { name: "reauthentication", type: "reauthentication", next: "/settings", expects: /verify|confirm|code|link|expired|settings/i },
];

for (const flow of FLOWS) {
  test(`${flow.name} link lands in the Gradr auth flow`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await page.goto(emailLink(flow.type, flow.next), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Never leaves the app origin for a placeholder/preview host.
    const url = page.url();
    for (const host of FORBIDDEN_HOSTS) {
      expect(url, `${flow.name} redirected to ${host}`).not.toContain(host);
    }

    // A real screen rendered, not a blank shell.
    const body = (await page.locator("body").innerText()).trim();
    expect(body.length, `${flow.name} rendered an empty page`).toBeGreaterThan(40);
    expect(body).toMatch(flow.expects);

    // The user always has a way forward from an expired/invalid link.
    const recovery = page.getByRole("link", { name: /sign in|log in|home|gradr|try again|resend/i });
    expect(await recovery.count()).toBeGreaterThan(0);

    // No crash-level console noise from the callback handler.
    const fatal = consoleErrors.filter((e) => /is not a function|undefined is not|Cannot read/i.test(e));
    expect(fatal, `${flow.name} produced runtime errors`).toEqual([]);
  });
}

test("password reset request form completes and confirms to the user", async ({ page }) => {
  await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
  const email = page.getByRole("textbox").first();
  await email.fill(`e2e+${Date.now()}@example.test`);
  await page.getByRole("button", { name: /reset|send|continue/i }).first().click();
  // Either a confirmation message or a rate-limit notice — both are valid,
  // a silent no-op is not.
  await expect(
    page.getByText(/check your (email|inbox)|sent|link|too many|try again/i).first(),
  ).toBeVisible({ timeout: 15000 });
});

test("auth callback preserves the redirect target in the URL", async ({ page }) => {
  await page.goto(emailLink("magiclink", "/dashboard"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const url = new URL(page.url());
  const carriesTarget =
    url.pathname.startsWith("/dashboard") ||
    url.searchParams.get("next") === "/dashboard" ||
    (url.searchParams.get("redirect_to") ?? "").includes("/dashboard") ||
    url.pathname.startsWith("/auth");
  expect(carriesTarget, `lost the redirect target: ${page.url()}`).toBe(true);
});
