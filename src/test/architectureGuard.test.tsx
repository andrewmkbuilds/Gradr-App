import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";

/**
 * Architecture guard: Gradr stays on Vite + React Router.
 * Blocks TanStack Start creeping in and verifies the router setup plus the
 * critical public/app routes are still declared and rendering.
 */
const ROOT = process.cwd();
const APP = readFileSync(join(ROOT, "src/App.tsx"), "utf8");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const FORBIDDEN = /@tanstack\/(start|react-start|react-router|router|start-[a-z-]+)/;

const CRITICAL_ROUTES = [
  "/",
  "/auth",
  "/pricing",
  "/interview",
  "/resume",
  "/billing",
  "*",
];

describe("no TanStack Start", () => {
  it("has no TanStack Start packages in package.json", () => {
    const names = [
      ...Object.keys(PKG.dependencies ?? {}),
      ...Object.keys(PKG.devDependencies ?? {}),
    ];
    expect(names.filter((n) => FORBIDDEN.test(n))).toEqual([]);
  });

  it("keeps react-router-dom as the router dependency", () => {
    expect(PKG.dependencies?.["react-router-dom"]).toBeTruthy();
  });

  it("does not import TanStack Start anywhere in App.tsx", () => {
    expect(FORBIDDEN.test(APP)).toBe(false);
  });

  it("wires the CI guardrail into prebuild", () => {
    expect(PKG.scripts?.prebuild ?? "").toContain("check-no-tanstack");
    expect(PKG.scripts?.["check:no-tanstack"]).toBeTruthy();
  });
});

describe("router setup", () => {
  it("mounts the app inside BrowserRouter", () => {
    expect(APP).toMatch(/<BrowserRouter>/);
    expect(APP).toMatch(/from "react-router-dom"/);
  });

  it("declares every critical route", () => {
    const declared = Array.from(APP.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1]);
    for (const route of CRITICAL_ROUTES) {
      expect(declared, `missing route ${route}`).toContain(route);
    }
  });

  it("mounts the public affiliate surface before the protected app catch-all", () => {
    expect(APP).toContain("{SATELLITE_SURFACES.map((surface) =>");
    expect(APP).not.toMatch(/SATELLITE_SURFACES\.filter\(\(s\) => s !== ["']affiliates["']\)/);
    expect(APP).not.toMatch(/PROTECTED_PREFIXES[\s\S]*?["']\/affiliate["']/);
  });

  it("renders and navigates with react-router primitives", () => {
    render(
      <MemoryRouter initialEntries={["/pricing"]}>
        <Routes>
          <Route path="/" element={<p>home</p>} />
          <Route
            path="/pricing"
            element={
              <div>
                <h1>Pricing</h1>
                <Link to="/">Home</Link>
              </div>
            }
          />
          <Route path="*" element={<p>not found</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Pricing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });

  it("falls back to the catch-all route for unknown paths", () => {
    render(
      <MemoryRouter initialEntries={["/definitely-not-a-route"]}>
        <Routes>
          <Route path="/" element={<p>home</p>} />
          <Route path="*" element={<p>not found</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("not found")).toBeInTheDocument();
  });
});
