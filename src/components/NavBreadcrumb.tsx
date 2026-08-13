import { Link, useLocation } from "react-router-dom";
import { Fragment, useMemo } from "react";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { navPath, resolveNavLocation } from "@/lib/navAnalytics";
import { trackEvent } from "@/lib/analytics";

/**
 * Page header path: Dashboard › Career › Resume Intelligence.
 *
 * Derived entirely from the nav config, so a section added to the sidebar
 * automatically gains a breadcrumb without a second source of truth.
 */
export function NavBreadcrumb() {
  const { pathname } = useLocation();
  const { group, item } = useMemo(() => resolveNavLocation(pathname), [pathname]);

  // Dashboard root needs no trail.
  if (pathname === "/" || !group) return null;

  const groupHref = navPath(group.url);
  // When the section landing page *is* the current subtab, the section crumb
  // would link to the page you are already on — render it as static text.
  const sectionIsSelf = !!item && navPath(item.url) === groupHref;

  const crumbs = [
    { label: group.title, href: groupHref, current: !item, static: sectionIsSelf },
    ...(item ? [{ label: item.title, href: navPath(item.url), current: true, static: false }] : []),
  ];


  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1.5">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              to="/"
              aria-label="Dashboard"
              className="interactive flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => trackEvent("nav_item_click", { location: "breadcrumb", item: "/", item_title: "Dashboard" })}
            >
              <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Dashboard</span>
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {crumbs.map((crumb) => (
          <Fragment key={crumb.href + crumb.label}>
            <BreadcrumbSeparator className="shrink-0" />
            <BreadcrumbItem className="min-w-0">
              {crumb.current ? (
                <BreadcrumbPage className="truncate font-medium text-foreground">{crumb.label}</BreadcrumbPage>
              ) : crumb.static ? (
                <span className="truncate text-muted-foreground">{crumb.label}</span>
              ) : (

                <BreadcrumbLink asChild>
                  <Link
                    to={crumb.href}
                    className="interactive truncate text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      trackEvent("nav_item_click", {
                        location: "breadcrumb",
                        item: crumb.href,
                        item_title: crumb.label,
                      })
                    }
                  >
                    {crumb.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default NavBreadcrumb;
