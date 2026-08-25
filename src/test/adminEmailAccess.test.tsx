import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * The email templates catalog and the delivery audit log expose recipient
 * addresses, suppression reasons and rendered templates. They are admin-only.
 *
 * This test proves the UI guard refuses a non-admin. The real boundary is
 * server-side: `email_delivery_audit`, `email_template_classification` and
 * `email_weekly_reports` are RLS-restricted to `has_role(auth.uid(),'admin')`,
 * and `admin_email_weekly_report()` raises without the admin role.
 */

const isAdminMock = vi.fn();

vi.mock("@/hooks/useAffiliate", () => ({
  useIsAdmin: () => isAdminMock(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const rpcMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpcMock(...args);
      return Promise.resolve({ error: null });
    },
  },
}));

import { RequireAdmin } from "@/components/RequireAdmin";

const ADMIN_EMAIL_ROUTES = ["/admin/email-templates", "/admin/email-audit"];

const APP = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

describe("admin-only email surfaces", () => {
  beforeEach(() => {
    isAdminMock.mockReset();
    rpcMock.mockClear();
  });

  it.each(ADMIN_EMAIL_ROUTES)("%s is declared behind RequireAdmin", (route) => {
    const line = APP.split("\n").find((l) => l.includes(`path="${route}"`));
    expect(line, `${route} has no route declaration`).toBeTruthy();
    expect(line).toMatch(/RequireAdmin/);
  });

  it("blocks a signed-in non-admin and never renders the page", async () => {
    isAdminMock.mockReturnValue({ data: false, isLoading: false });
    render(
      <MemoryRouter>
        <RequireAdmin>
          <div>email delivery audit contents</div>
        </RequireAdmin>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Admin access required/i)).toBeInTheDocument();
    expect(screen.queryByText("email delivery audit contents")).toBeNull();
  });

  it("logs the denied attempt server-side", async () => {
    isAdminMock.mockReturnValue({ data: false, isLoading: false });
    render(
      <MemoryRouter initialEntries={["/admin/email-audit"]}>
        <RequireAdmin>
          <div>secret</div>
        </RequireAdmin>
      </MemoryRouter>,
    );
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("log_admin_access_denied", expect.anything()));
  });

  it("renders the page for an admin", async () => {
    isAdminMock.mockReturnValue({ data: true, isLoading: false });
    render(
      <MemoryRouter>
        <RequireAdmin>
          <div>email delivery audit contents</div>
        </RequireAdmin>
      </MemoryRouter>,
    );
    expect(await screen.findByText("email delivery audit contents")).toBeInTheDocument();
  });
});
