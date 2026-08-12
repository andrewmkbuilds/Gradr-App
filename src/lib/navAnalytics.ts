import { trackEvent } from "@/lib/analytics";
import { navGroups, dashboardItem, type NavGroup, type NavItem } from "@/config/nav";

/**
 * Lightweight navigation analytics.
 *
 * Records which sidebar groups, subtabs and mobile tabs users actually open so
 * the most-used parts of the navigation can be surfaced and the rest pruned.
 * Everything funnels through the existing `trackEvent` pipeline (dataLayer +
 * analytics_events), so there is no extra transport or dependency.
 */

export type NavSurface = "sidebar" | "sidebar_rail" | "mobile_drawer" | "mobile_tabbar" | "breadcrumb";

/** Strip the hash so `/growth#proof` reports against the `/growth` route. */
export const navPath = (url: string) => url.split("#")[0];

/** Reverse lookup: which group (if any) owns this pathname. */
export function resolveNavLocation(pathname: string): {
  group?: NavGroup;
  item?: NavItem;
} {
  for (const group of navGroups) {
    for (const item of group.items) {
      const path = navPath(item.url);
      const hit = item.matchPrefix ? pathname === path || pathname.startsWith(`${path}/`) : pathname === path;
      if (hit) return { group, item };
    }
  }
  // Nested routes that are not listed explicitly still resolve to their group.
  for (const group of navGroups) {
    const base = navPath(group.url);
    if (pathname === base || pathname.startsWith(`${base}/`)) return { group };
  }
  return {};
}

/** A sidebar group was expanded or collapsed. */
export function trackNavGroupToggle(group: NavGroup, open: boolean, surface: NavSurface = "sidebar") {
  trackEvent("nav_group_toggle", {
    location: surface,
    group: group.id,
    group_title: group.title,
    state: open ? "open" : "closed",
    destination: navPath(group.url),
  });
}

/** A subtab (child link) inside a sidebar group was opened. */
export function trackNavItemClick(item: NavItem, group: NavGroup | null, surface: NavSurface = "sidebar") {
  trackEvent("nav_item_click", {
    location: surface,
    group: group?.id ?? "root",
    group_title: group?.title ?? "Root",
    item: navPath(item.url),
    item_title: item.title,
    destination: item.url,
  });
}

/** Top-level destination on the mobile bottom bar. */
export function trackMobileTab(id: string, title: string, url: string) {
  trackEvent("nav_item_click", {
    location: "mobile_tabbar",
    group: id,
    group_title: title,
    item: navPath(url),
    item_title: title,
    destination: url,
  });
}

/** Dashboard is a top-level link with no owning group. */
export function trackDashboardClick(surface: NavSurface = "sidebar") {
  trackNavItemClick(dashboardItem, null, surface);
}
