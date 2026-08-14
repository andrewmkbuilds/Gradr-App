import { describe, it, expect } from "vitest";
import {
  PRODUCTION_ORIGIN,
  canonicalUrlFor,
  deployEnv,
  isMultiSurfaceHost,
  satelliteSubdomainsLive,
  surfaceFromHost,
} from "@/config/domains";

/**
 * Production surface routing contract.
 *
 * The authenticated product is canonically served from app.gradr.me; gradr.me
 * is the public site. While hosting still 302s every non-primary domain to the
 * primary one, the app has to stay reachable on the primary host — hence the
 * "prove it by executing there" rule in `satelliteSubdomainsLive`.
 */
describe("surface routing", () => {
  it("maps each production hostname to its surface", () => {
    expect(surfaceFromHost("gradr.me")).toBe("home");
    expect(surfaceFromHost("www.gradr.me")).toBe("home");
    expect(surfaceFromHost("app.gradr.me")).toBe("app");
    expect(surfaceFromHost("marketing.gradr.me")).toBe("marketing");
    expect(surfaceFromHost("news.gradr.me")).toBe("news");
    expect(surfaceFromHost("docs.gradr.me")).toBe("docs");
    expect(surfaceFromHost("affiliates.gradr.me")).toBe("affiliates");
  });

  it("treats a satellite host that actually served the bundle as live", () => {
    expect(satelliteSubdomainsLive("app.gradr.me")).toBe(true);
    expect(isMultiSurfaceHost("app.gradr.me")).toBe(false);
    expect(satelliteSubdomainsLive("docs.gradr.me")).toBe(true);
  });

  it("keeps the primary host multi-surface until the app subdomain is served", () => {
    // Without VITE_APP_SUBDOMAIN_LIVE=true, gradr.me must keep serving the
    // product routes, otherwise the app is unreachable behind the platform 302.
    expect(satelliteSubdomainsLive("gradr.me")).toBe(false);
    expect(isMultiSurfaceHost("gradr.me")).toBe(true);
  });

  it("never treats previews or localhost as production", () => {
    expect(deployEnv("id-preview--x.lovable.app")).toBe("preview");
    expect(deployEnv("localhost")).toBe("development");
    expect(isMultiSurfaceHost("localhost")).toBe(true);
  });

  it("canonicalises product URLs to app.gradr.me regardless of host", () => {
    expect(PRODUCTION_ORIGIN.app).toBe("https://app.gradr.me");
    expect(canonicalUrlFor("app", "/dashboard")).toBe("https://app.gradr.me/dashboard");
    expect(canonicalUrlFor("home", "/")).toBe("https://gradr.me");
  });
});
