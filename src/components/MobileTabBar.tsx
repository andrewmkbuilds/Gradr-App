import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { dashboardItem, navGroups } from "@/config/nav";
import { trackMobileTab } from "@/lib/navAnalytics";

const primaryIds = ["career", "interview", "growth", "account"];

/**
 * Mobile bottom navigation: 5 primary destinations only.
 * Everything else (More / Admin) stays reachable through the sidebar drawer.
 */
export function MobileTabBar() {
  const { pathname } = useLocation();
  const groups = navGroups.filter((g) => primaryIds.includes(g.id));

  const tabs = [
    { id: "dashboard", title: dashboardItem.title, url: dashboardItem.url, icon: dashboardItem.icon, paths: ["/"] },
    ...groups.map((g) => ({
      id: g.id,
      title: g.title,
      url: g.url,
      icon: g.icon,
      paths: g.items.map((i) => i.url.split("#")[0]),
    })),
  ];

  return (
    <nav
      aria-label="Primary"
      className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t border-border/70 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active =
            tab.id === "dashboard"
              ? pathname === "/"
              : tab.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={tab.id}>
              {/* Plain Link: active state is section-scoped (any child route of the
                  group counts), which react-router's NavLink exact matching cannot express. */}
              <Link
                to={tab.url}
                aria-current={active ? "page" : undefined}
                onClick={() => trackMobileTab(tab.id, tab.title, tab.url)}
                className={cn(
                  // min-h-11 keeps every tap target at least 44px tall.
                  "interactive flex min-h-11 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon
                  aria-hidden="true"
                  className={cn("h-[18px] w-[18px] transition-transform", active && "scale-110")}
                />
                <span className="truncate">{tab.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
