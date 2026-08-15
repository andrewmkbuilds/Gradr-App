import { describe, it, expect, afterEach, vi } from "vitest";
import {
  currentSurface,
  isMultiSurfaceHost,
  pinnedSurface,
  satelliteSubdomainsLive,
  surfaceBase,
  urlFor,
} from "@/config/domains";

/**
 * Build-time surface pin contract.
 *
 * Hosting serves one primary domain per project, so serving app.gradr.me
 * directly requires a project whose primary domain is app.gradr.me. That
 * project sets VITE_GRADR_SURFACE=app, and this pin makes the bundle render
 * exactly that surface at "/" on every host it runs on — including its
 * *.lovable.app preview URL, so the surface is verifiable before DNS moves.
 */
describe("surface pin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is inactive by default, preserving existing routing", () => {
    expect(pinnedSurface()).toBeNull();
    // Unpinned preview host still uses path prefixes.
    expect(isMultiSurfaceHost("preview.lovable.app")).toBe(true);
    expect(surfaceBase("docs", "preview.lovable.app")).toBe("/docs");
  });

  it("ignores an unknown surface value rather than routing nowhere", () => {
    vi.stubEnv("VITE_GRADR_SURFACE", "not-a-surface");
    expect(pinnedSurface()).toBeNull();
    expect(isMultiSurfaceHost("preview.lovable.app")).toBe(true);
  });

  it("accepts surface names case-insensitively and trimmed", () => {
    vi.stubEnv("VITE_GRADR_SURFACE", "  App  ");
    expect(pinnedSurface()).toBe("app");
  });

  it("renders the pinned surface at the root path, ignoring path prefixes", () => {
    vi.stubEnv("VITE_GRADR_SURFACE", "docs");
    expect(currentSurface("/")).toBe("docs");
    // Crucially: not overridden by an unrelated path prefix.
    expect(currentSurface("/news/something")).toBe("docs");
    expect(surfaceBase("docs", "docs-project.lovable.app")).toBe("");
  });

  it("treats a pinned build as a dedicated per-domain deployment", () => {
    vi.stubEnv("VITE_GRADR_SURFACE", "app");
    // True even on a preview host: the project is single-surface by construction.
    expect(satelliteSubdomainsLive("app-project.lovable.app")).toBe(true);
    expect(isMultiSurfaceHost("app-project.lovable.app")).toBe(false);
    expect(currentSurface("/dashboard")).toBe("app");
    // App routes mount at the root, not behind a prefix.
    expect(surfaceBase("app", "app.gradr.me")).toBe("");
  });

  it("keeps same-surface links on the current host and cross-surface links canonical", () => {
    vi.stubEnv("VITE_GRADR_SURFACE", "app");
    // jsdom origin is http://localhost:3000 by default.
    const origin = window.location.origin;
    expect(urlFor("app", "/dashboard")).toBe(`${origin}/dashboard`);
    // Other surfaces genuinely live on other origins.
    expect(urlFor("home", "/")).toBe("https://gradr.me/");
    expect(urlFor("docs", "/guides")).toBe("https://docs.gradr.me/guides");
  });

  it("pins the home surface without stealing product routes", () => {
    vi.stubEnv("VITE_GRADR_SURFACE", "home");
    expect(currentSurface("/")).toBe("home");
    // Product routes still resolve to the app origin, not the apex.
    expect(urlFor("app", "/dashboard")).toBe("https://app.gradr.me/dashboard");
  });
});
