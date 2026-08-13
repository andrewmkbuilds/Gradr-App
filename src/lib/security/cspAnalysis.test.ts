import { describe, expect, it } from "vitest";
import { analyzeCsp, evaluateEnforcementReadiness, surfacesFor } from "./cspAnalysis";

const NOW = new Date("2026-03-10T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const row = (over: Partial<Parameters<typeof surfacesFor>[0]> = {}) => ({
  created_at: hoursAgo(1),
  effective_directive: "script-src",
  blocked_origin: "https://cdn.example.com",
  document_path: "/pricing",
  ...over,
});

describe("surfacesFor", () => {
  it("flags auth routes, Supabase origins and PWA directives", () => {
    expect(surfacesFor(row({ document_path: "/auth" }))).toContain("auth");
    expect(surfacesFor(row({ blocked_origin: "https://abc.supabase.co" }))).toContain("supabase");
    expect(surfacesFor(row({ effective_directive: "manifest-src" }))).toContain("pwa");
    expect(surfacesFor(row())).toEqual([]);
  });
});

describe("analyzeCsp", () => {
  it("detects a spike only above both the floor and the baseline multiple", () => {
    const rows = [
      ...Array.from({ length: 60 }, () => row()),
      ...Array.from({ length: 5 }, (_, i) => row({ created_at: daysAgo(i + 2) })),
    ];
    const spike = analyzeCsp(rows, { now: NOW }).spikes[0];
    expect(spike?.blockedOrigin).toBe("https://cdn.example.com");
    expect(spike!.multiple).toBeGreaterThanOrEqual(3);
  });

  it("ignores low-volume noise", () => {
    const rows = Array.from({ length: 4 }, () => row());
    expect(analyzeCsp(rows, { now: NOW }).spikes).toHaveLength(0);
  });

  it("reports a directive/origin pair first seen inside the window as new", () => {
    const rows = [
      row({ blocked_origin: "https://new-widget.io" }),
      row({ created_at: daysAgo(5), blocked_origin: "https://old.io" }),
    ];
    const { newCombos } = analyzeCsp(rows, { now: NOW });
    expect(newCombos.map((c) => c.blockedOrigin)).toEqual(["https://new-widget.io"]);
  });
});

describe("evaluateEnforcementReadiness", () => {
  it("is ready after a clean week", () => {
    const readiness = evaluateEnforcementReadiness(
      [row({ created_at: daysAgo(9), document_path: "/auth" })],
      { now: NOW },
    );
    expect(readiness.ready).toBe(true);
    expect(readiness.cleanDays).toBe(7);
  });

  it("blocks on a critical violation and names the surface", () => {
    const readiness = evaluateEnforcementReadiness(
      [row({ created_at: daysAgo(2), blocked_origin: "https://abc.supabase.co" })],
      { now: NOW },
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(" ")).toContain("Supabase");
    expect(readiness.cleanDays).toBe(2);
  });

  it("ignores non-critical violations", () => {
    const readiness = evaluateEnforcementReadiness([row({ created_at: hoursAgo(2) })], { now: NOW });
    expect(readiness.ready).toBe(true);
  });
});
