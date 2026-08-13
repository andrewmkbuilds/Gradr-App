import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronDown, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Link, useLocation } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { cn } from "@/lib/utils";
import { dashboardItem, navGroups, type NavGroup, type NavItem } from "@/config/nav";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  useSidebarKeyboardNav,
  useMobileDrawerFocus,
  useMobileDrawerContainment,
} from "@/hooks/useSidebarKeyboardNav";
import { trackDashboardClick, trackNavGroupToggle, trackNavItemClick } from "@/lib/navAnalytics";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const itemPath = (url: string) => url.split("#")[0];

function isItemActive(item: NavItem, pathname: string) {
  const path = itemPath(item.url);
  return item.matchPrefix ? pathname === path || pathname.startsWith(`${path}/`) : pathname === path;
}

function isGroupActive(group: NavGroup, pathname: string) {
  return group.items.some((i) => isItemActive(i, pathname));
}

const baseRow =
  "nav-item interactive group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors";
const idleRow = "text-muted-foreground hover:bg-secondary hover:text-foreground";
const activeRow = "bg-primary/10 text-primary accent-rail";

export function AppSidebar() {
  const { state, toggleSidebar, isMobile, setOpenMobile, openMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const navRef = useRef<HTMLDivElement>(null);

  // Admin links are only rendered for verified admins. This is presentation
  // only — every admin route is additionally wrapped in <RequireAdmin> and
  // every admin table/RPC enforces has_role() server-side.
  const groups = useMemo(() => navGroups.filter((g) => !g.adminOnly || isAdmin), [isAdmin]);

  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    navGroups.filter((g) => isGroupActive(g, pathname)).map((g) => g.id),
  );

  // Keep the group containing the active route expanded on navigation.
  useEffect(() => {
    const active = navGroups.find((g) => isGroupActive(g, pathname));
    if (active) setOpenGroups((prev) => (prev.includes(active.id) ? prev : [...prev, active.id]));
  }, [pathname]);

  const setGroupOpen = (groupId: string, open: boolean) => {
    const group = navGroups.find((g) => g.id === groupId);
    setOpenGroups((prev) => (open ? [...new Set([...prev, groupId])] : prev.filter((id) => id !== groupId)));
    if (group) trackNavGroupToggle(group, open, isMobile ? "mobile_drawer" : "sidebar");
  };

  useSidebarKeyboardNav(navRef, {
    setGroupOpen: (id, open) => setGroupOpen(id, open),
    isGroupOpen: (id) => openGroups.includes(id),
  });
  useMobileDrawerFocus(navRef, openMobile, isMobile);
  useMobileDrawerContainment(navRef, openMobile, isMobile);

  const surface = isMobile ? "mobile_drawer" : collapsed ? "sidebar_rail" : "sidebar";
  const closeMobile = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <Link to="/" onClick={closeMobile} className="flex items-center gap-2" aria-label="Gradr home">
          {collapsed ? (
            <BrandLogo size={32} className="mx-auto" />
          ) : (
            <>
              <BrandLogo size={32} />
              <div>
                <div className="text-sm font-bold tracking-tight text-foreground">Gradr</div>
                <p className="text-[10px] text-muted-foreground">AI Career System</p>
              </div>
            </>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {/* Arrow-key roving navigation is wired to this container. */}
            <nav ref={navRef} aria-label="Main navigation">
              <SidebarMenu className="gap-0.5">
                {/* Dashboard */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link
                      to={dashboardItem.url}
                      data-nav-focusable=""
                      onClick={() => {
                        trackDashboardClick(surface);
                        closeMobile();
                      }}
                      aria-current={pathname === "/" ? "page" : undefined}
                      className={cn(baseRow, pathname === "/" ? activeRow : idleRow)}
                    >
                      <dashboardItem.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {collapsed ? (
                        <span className="sr-only">{dashboardItem.title}</span>
                      ) : (
                        <span className="truncate">{dashboardItem.title}</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {groups.map((group) => {
                  const groupActive = isGroupActive(group, pathname);
                  const open = openGroups.includes(group.id);

                  // Collapsed rail: group icon links to its primary route.
                  if (collapsed) {
                    return (
                      <SidebarMenuItem key={group.id}>
                        <SidebarMenuButton asChild tooltip={group.title}>
                          <Link
                            to={group.url}
                            data-nav-focusable=""
                            onClick={() => trackNavGroupToggle(group, true, "sidebar_rail")}
                            aria-current={groupActive ? "page" : undefined}
                            className={cn(baseRow, "justify-center px-0", groupActive ? activeRow : idleRow)}
                          >
                            <group.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="sr-only">{group.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  const panelId = `nav-group-${group.id}`;

                  return (
                    <Collapsible key={group.id} open={open} onOpenChange={(next) => setGroupOpen(group.id, next)}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            data-nav-focusable=""
                            data-nav-group={group.id}
                            aria-expanded={open}
                            aria-controls={panelId}
                            className={cn(
                              baseRow,
                              "press-scale",
                              groupActive && !open ? activeRow : "text-foreground/90 hover:bg-secondary",
                            )}
                          >
                            <group.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="flex-1 text-left font-medium">{group.title}</span>
                            {groupActive && (
                              <span className="sr-only">(contains the current page)</span>
                            )}
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                                open && "rotate-180",
                              )}
                            />
                          </button>
                        </CollapsibleTrigger>

                        <CollapsibleContent
                          id={panelId}
                          className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
                        >
                          <ul
                            aria-label={`${group.title} pages`}
                            className="ml-4 mt-0.5 space-y-0.5 border-l border-border/60 pl-2"
                          >
                            {group.items.map((item) => {
                              const active = isItemActive(item, pathname);
                              return (
                                <li key={item.url}>
                                  <Link
                                    to={item.url}
                                    data-nav-focusable=""
                                    data-nav-parent={group.id}
                                    onClick={() => {
                                      trackNavItemClick(item, group, surface);
                                      closeMobile();
                                    }}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                      "interactive flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                                      active
                                        ? "bg-primary/10 font-medium text-primary accent-rail"
                                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                                    )}
                                  >
                                    <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{item.title}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-1">
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="interactive press-scale flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sign Out</span>}
        </button>
        {!isMobile && (
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="interactive press-scale flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft
              aria-hidden="true"
              className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")}
            />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
