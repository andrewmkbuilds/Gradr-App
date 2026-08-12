import { forwardRef, type ComponentProps } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<ComponentProps<typeof Link>, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  end?: boolean;
}

/**
 * react-router NavLink replacement: computes the active state from the
 * current location instead of the removed function-form className prop.
 */
const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, end, to, ...props }, ref) => {
    const { pathname } = useLocation();
    const target = typeof to === "string" ? to.split("?")[0]?.split("#")[0] ?? "" : "";
    const isActive = end
      ? pathname === target
      : pathname === target || (target !== "/" && pathname.startsWith(`${target}/`));

    return (
      <Link
        ref={ref}
        to={to}
        aria-current={isActive ? "page" : undefined}
        className={cn(className, isActive && activeClassName)}
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
