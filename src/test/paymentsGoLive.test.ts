import { describe, expect, it } from "vitest";
import { diagnosePaymentsConfig } from "@/lib/paymentsConfig";
import { validatePaymentsConfig } from "@/lib/payments/validate";
import { buildGoLiveChecklist, goLiveProgress } from "@/lib/payments/goLive";
import { surfacesDisagree, type BuildManifestResult } from "@/lib/payments/buildManifest";
import { buildPaymentsManifest } from "../../plugins/payments-build-manifest";

const manifest = (env: "sandbox" | "live"): BuildManifestResult["manifest"] => ({
  version: 1,
  mode: "production",
  tokenType: env === "live" ? "live" : "test",
  tokenPreview: `${env === "live" ? "live" : "test"}_abc…1234`,
  environmentVar: env,
  resolvedEnvironment: env,
  mismatch: false,
  checkoutEnabled: true,
  builtAt: "2026-08-29T00:00:00.000Z",
});

describe("validatePaymentsConfig", () => {
  it("blocks checkout when no token is inlined", () => {
    const v = validatePaymentsConfig(diagnosePaymentsConfig({}));
    expect(v.severity).toBe("error");
    expect(v.code).toBe("missing_token");
    expect(v.blocksCheckout).toBe(true);
    expect(v.steps.length).toBeGreaterThan(0);
  });

  it("blocks on an invalid environment value", () => {
    const v = validatePaymentsConfig(
      diagnosePaymentsConfig({
        VITE_PAYMENTS_CLIENT_TOKEN: "live_abc123456789",
        VITE_PAYMENTS_ENVIRONMENT: "prod",
      }),
    );
    expect(v.code).toBe("invalid_environment");
    expect(v.blocksCheckout).toBe(true);
  });

  it("warns — but never blocks — on a token/env mismatch and names the real catalog", () => {
    const v = validatePaymentsConfig(
      diagnosePaymentsConfig({
        VITE_PAYMENTS_CLIENT_TOKEN: "live_abc123456789",
        VITE_PAYMENTS_ENVIRONMENT: "sandbox",
      }),
    );
    expect(v.code).toBe("environment_mismatch");
    expect(v.severity).toBe("warning");
    expect(v.blocksCheckout).toBe(false);
    expect(v.effectiveEnvironment).toBe("live");
    expect(v.detail).toMatch(/real money/);
  });

  it("passes when token and environment agree", () => {
    const v = validatePaymentsConfig(
      diagnosePaymentsConfig({
        VITE_PAYMENTS_CLIENT_TOKEN: "test_abc123456789",
        VITE_PAYMENTS_ENVIRONMENT: "sandbox",
      }),
    );
    expect(v.severity).toBe("ok");
    expect(v.steps).toEqual([]);
  });
});

describe("buildGoLiveChecklist", () => {
  const okValidation = validatePaymentsConfig(
    diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "live_abc123456789",
      VITE_PAYMENTS_ENVIRONMENT: "live",
    }),
  );

  it("marks every runtime signal pending while probes are loading", () => {
    const steps = buildGoLiveChecklist({
      validation: okValidation,
      preflight: null,
      policies: null,
      builds: null,
    });
    expect(steps.filter((s) => s.state === "pending")).toHaveLength(3);
    expect(steps.find((s) => s.id === "config")?.state).toBe("done");
  });

  it("blocks when production still ships a sandbox token", () => {
    const steps = buildGoLiveChecklist({
      validation: okValidation,
      preflight: null,
      policies: null,
      builds: [
        { surface: "preview", origin: "http://localhost", manifest: manifest("sandbox") },
        { surface: "production", origin: "https://app.gradr.me", manifest: manifest("sandbox") },
      ],
    });
    const step = steps.find((s) => s.id === "live-token");
    expect(step?.state).toBe("blocked");
    expect(step?.action?.href).toContain("payments-status");
  });

  it("blocks on missing catalog prices and unreachable policy pages", () => {
    const steps = buildGoLiveChecklist({
      validation: okValidation,
      preflight: {
        status: "partial",
        environment: "live",
        checked: ["a", "b"],
        resolved: ["a"],
        missing: ["b"],
        checkedAt: new Date().toISOString(),
        durationMs: 12,
      },
      policies: [
        { path: "/terms", ok: true },
        { path: "/refunds", ok: false },
      ],
      builds: null,
    });
    expect(steps.find((s) => s.id === "catalog")?.state).toBe("blocked");
    expect(steps.find((s) => s.id === "policies")?.detail).toContain("/refunds");
    expect(goLiveProgress(steps).blocked).toBeGreaterThanOrEqual(2);
  });

  it("gives every remaining step exactly one next action", () => {
    const steps = buildGoLiveChecklist({
      validation: okValidation,
      preflight: null,
      policies: null,
      builds: null,
    });
    for (const step of steps.filter((s) => s.state !== "done")) {
      expect(step.action?.href).toBeTruthy();
      expect(step.action?.label).toBeTruthy();
    }
  });
});

describe("build manifest", () => {
  it("never writes the raw token and derives the environment from the prefix", () => {
    const m = buildPaymentsManifest(
      { VITE_PAYMENTS_CLIENT_TOKEN: "live_supersecrettoken123", VITE_PAYMENTS_ENVIRONMENT: "sandbox" },
      "production",
    );
    expect(m.tokenPreview).not.toContain("supersecrettoken123");
    expect(m.tokenType).toBe("live");
    expect(m.resolvedEnvironment).toBe("live");
    expect(m.mismatch).toBe(true);
    expect(m.checkoutEnabled).toBe(true);
  });

  it("reports a missing token as unsellable", () => {
    const m = buildPaymentsManifest({}, "production");
    expect(m.tokenType).toBe("none");
    expect(m.checkoutEnabled).toBe(false);
    expect(m.resolvedEnvironment).toBeNull();
  });

  it("detects surfaces pointing at different catalogs", () => {
    expect(
      surfacesDisagree([
        { surface: "preview", origin: "a", manifest: manifest("sandbox") },
        { surface: "production", origin: "b", manifest: manifest("live") },
      ]),
    ).toBe(true);
  });
});
