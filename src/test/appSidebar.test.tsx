/**
 * Sidebar navigation: renders, highlights the active route, and honours the
 * arrow-key contract wired up by useSidebarKeyboardNav.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/hooks/useAffiliate", () => ({ useIsAdmin: () => ({ data: false }) }));
vi.mock("@/lib/navAnalytics", () => ({
  trackDashboardClick: vi.fn(),
  trackNavGroupToggle: vi.fn(),
  trackNavItemClick: vi.fn(),
}));

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { navGroups, dashboardItem } from "@/config/nav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

const firstGroup = navGroups.find((g) => !g.adminOnly)!;
const firstItem = firstGroup.items[0]!;

beforeEach(() => {
  window.localStorage.clear();
});

describe("AppSidebar", () => {
  it("renders the nav landmark with every non-admin group", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
    navGroups
      .filter((g) => !g.adminOnly)
      .forEach((g) => expect(screen.getByRole("button", { name: new RegExp(g.title, "i") })).toBeTruthy());
  });

  it("hides admin-only groups from non-admins", () => {
    renderAt("/");
    navGroups
      .filter((g) => g.adminOnly)
      .forEach((g) =>
        expect(screen.queryByRole("button", { name: new RegExp(`^${g.title}$`, "i") })).toBeNull(),
      );
  });

  it("marks the dashboard as the current page on /", () => {
    renderAt("/");
    const link = screen.getByRole("link", { name: new RegExp(dashboardItem.title, "i") });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("expands the group containing the active route and highlights that item", async () => {
    renderAt(firstItem.url);
    const active = await screen.findByRole("link", { name: new RegExp(firstItem.title, "i") });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("text-primary");

    const trigger = screen.getByRole("button", { name: new RegExp(firstGroup.title, "i") });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("moves focus between rows with ArrowDown / ArrowUp and Home / End", async () => {
    const user = userEvent.setup();
    renderAt("/");

    const dashboard = screen.getByRole("link", { name: new RegExp(dashboardItem.title, "i") });
    dashboard.focus();
    expect(document.activeElement).toBe(dashboard);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).not.toBe(dashboard);
    expect((document.activeElement as HTMLElement).dataset.navFocusable).toBe("");

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(dashboard);

    await user.keyboard("{End}");
    const last = document.activeElement as HTMLElement;
    expect(last).not.toBe(dashboard);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(dashboard);
  });

  it("opens a collapsed group with ArrowRight and closes it with ArrowLeft", async () => {
    const user = userEvent.setup();
    renderAt("/");

    const trigger = screen.getByRole("button", { name: new RegExp(firstGroup.title, "i") });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    trigger.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: new RegExp(firstItem.title, "i") })).toBeInTheDocument(),
    );

    trigger.focus();
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  });
});
