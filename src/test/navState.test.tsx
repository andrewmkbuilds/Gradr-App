/**
 * Navigation state contract.
 *
 * Covers the mobile tab bar and the sidebar drawer: active state must follow
 * the URL immediately (including rapid consecutive clicks and back/forward),
 * and the mobile drawer must close on every navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/hooks/useAffiliate", () => ({ useIsAdmin: () => ({ data: false }) }));
vi.mock("@/lib/navAnalytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/navAnalytics")>();
  return {
    ...actual,
    trackDashboardClick: vi.fn(),
    trackNavGroupToggle: vi.fn(),
    trackNavItemClick: vi.fn(),
    trackMobileTab: vi.fn(),
  };
});

// Force the mobile branch of the sidebar context.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

import { MobileTabBar } from "@/components/MobileTabBar";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { navGroups, dashboardItem } from "@/config/nav";
import { navPath } from "@/lib/navAnalytics";

const primaryIds = ["career", "interview", "growth", "account"];
const tabGroups = navGroups.filter((g) => primaryIds.includes(g.id));

function LocationProbe() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="pathname">{pathname}</output>
      {/* Stands in for the browser back button (MemoryRouter has its own stack). */}
      <button type="button" onClick={() => navigate(-1)}>
        go back
      </button>
    </>
  );
}

function renderTabBar(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
      <LocationProbe />
      <Routes>
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-motion");
});

describe("mobile tab bar", () => {
  it("renders exactly five primary destinations", () => {
    renderTabBar();
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
  });

  it("marks the dashboard tab current on /", () => {
    renderTabBar("/");
    expect(screen.getByRole("link", { name: new RegExp(dashboardItem.title, "i") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it.each(tabGroups.map((g) => [g.title, navPath(g.items[0]!.url)] as const))(
    "keeps the %s tab active on its child route %s",
    (title, childPath) => {
      renderTabBar(childPath);
      expect(screen.getByRole("link", { name: new RegExp(title, "i") })).toHaveAttribute("aria-current", "page");
    },
  );

  it("updates the active tab immediately after a click", async () => {
    const user = userEvent.setup();
    renderTabBar("/");
    const target = tabGroups[0]!;
    const link = screen.getByRole("link", { name: new RegExp(target.title, "i") });

    await user.click(link);

    expect(screen.getByTestId("pathname").textContent).toBe(navPath(target.url));
    expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: new RegExp(dashboardItem.title, "i") })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("stays consistent after rapid consecutive clicks", async () => {
    const user = userEvent.setup();
    renderTabBar("/");

    for (const group of tabGroups) {
      await user.click(screen.getByRole("link", { name: new RegExp(group.title, "i") }));
    }
    const last = tabGroups[tabGroups.length - 1]!;

    expect(screen.getByTestId("pathname").textContent).toBe(navPath(last.url));
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(new RegExp(last.title, "i"));
  });

  it("follows browser back navigation", async () => {
    const user = userEvent.setup();
    renderTabBar("/");
    const target = tabGroups[1] ?? tabGroups[0]!;
    await user.click(screen.getByRole("link", { name: new RegExp(target.title, "i") }));
    expect(screen.getByTestId("pathname").textContent).toBe(navPath(target.url));

    await user.click(screen.getByRole("button", { name: /go back/i }));

    await waitFor(() => expect(screen.getByTestId("pathname").textContent).toBe("/"));
    expect(screen.getByRole("link", { name: new RegExp(dashboardItem.title, "i") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("gives every tab a >=44px tap target", () => {
    renderTabBar();
    screen
      .getAllByRole("link")
      .forEach((link) => expect(link.className).toMatch(/min-h-11/));
  });
});

/** Exposes the drawer state so the test can assert it closes on navigation. */
function DrawerProbe() {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <>
      <output data-testid="drawer">{openMobile ? "open" : "closed"}</output>
      <button type="button" onClick={() => setOpenMobile(true)}>
        open drawer
      </button>
    </>
  );
}

function renderDrawer(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <DrawerProbe />
        <AppSidebar />
        <LocationProbe />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("mobile sidebar drawer", () => {
  it("closes as soon as the location changes", async () => {
    const user = userEvent.setup();
    renderDrawer("/");

    await user.click(screen.getByRole("button", { name: /open drawer/i }));
    expect(screen.getByTestId("drawer").textContent).toBe("open");

    const link = await screen.findByRole("link", { name: new RegExp(dashboardItem.title, "i") });
    await user.click(link);

    const group = navGroups.find((g) => !g.adminOnly)!;
    await user.click(screen.getByRole("button", { name: /open drawer/i }));
    await user.click(screen.getByRole("button", { name: new RegExp(group.title, "i") }));
    const item = await screen.findByRole("link", { name: new RegExp(group.items[0]!.title, "i") });
    await user.click(item);

    await waitFor(() => expect(screen.getByTestId("drawer").textContent).toBe("closed"));
    expect(screen.getByTestId("pathname").textContent).toBe(navPath(group.items[0]!.url));
  });
});
