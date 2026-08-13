import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard navigation for the sidebar tree.
 *
 * Implements the WAI-ARIA disclosure-navigation keyboard contract on top of
 * the existing markup:
 *   ArrowDown / ArrowUp  move focus between visible nav rows (wrapping)
 *   ArrowRight           expand a collapsed group, or step into its first child
 *   ArrowLeft            collapse an expanded group, or jump back to its header
 *   Home / End           first / last visible row
 *   Enter / Space        activate (native for links and buttons)
 *
 * Rows opt in with `data-nav-focusable`; group headers add `data-nav-group`
 * and children add `data-nav-parent="<groupId>"`.
 */
export function useSidebarKeyboardNav(
  containerRef: RefObject<HTMLElement>,
  handlers: {
    setGroupOpen: (groupId: string, open: boolean) => void;
    isGroupOpen: (groupId: string) => boolean;
  },
) {
  const { setGroupOpen, isGroupOpen } = handlers;

  const rows = useCallback((): HTMLElement[] => {
    const root = containerRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>("[data-nav-focusable]")).filter(
      // Skip rows inside collapsed groups.
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }, [containerRef]);

  const focusAt = useCallback(
    (list: HTMLElement[], index: number) => {
      if (!list.length) return;
      const next = list[(index + list.length) % list.length];
      next.focus();
    },
    [],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const current = target?.closest<HTMLElement>("[data-nav-focusable]");
      if (!current) return;

      const list = rows();
      const index = list.indexOf(current);
      const groupId = current.dataset.navGroup;
      const parentId = current.dataset.navParent;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusAt(list, index + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          focusAt(list, index - 1);
          break;
        case "Home":
          event.preventDefault();
          focusAt(list, 0);
          break;
        case "End":
          event.preventDefault();
          focusAt(list, list.length - 1);
          break;
        case "ArrowRight":
          if (!groupId) return;
          event.preventDefault();
          if (!isGroupOpen(groupId)) {
            setGroupOpen(groupId, true);
            // Wait for the disclosure to render before stepping into it.
            requestAnimationFrame(() => {
              const child = root.querySelector<HTMLElement>(`[data-nav-parent="${groupId}"]`);
              child?.focus();
            });
          } else {
            root.querySelector<HTMLElement>(`[data-nav-parent="${groupId}"]`)?.focus();
          }
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (groupId && isGroupOpen(groupId)) {
            setGroupOpen(groupId, false);
          } else if (parentId) {
            root.querySelector<HTMLElement>(`[data-nav-group="${parentId}"]`)?.focus();
          }
          break;
        default:
          break;
      }
    };

    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [containerRef, rows, focusAt, isGroupOpen, setGroupOpen]);
}

/**
 * Mobile drawer behaviour: bring the active row into view and move focus to it
 * when the drawer opens, so screen-reader and keyboard users start where they
 * currently are rather than at the top of a long list.
 */
export function useMobileDrawerFocus(containerRef: RefObject<HTMLElement>, open: boolean, enabled: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (!open) {
      // Drawer closed: hand focus back to the trigger. The sheet's own close-focus
      // handling lands on <body> once focus was moved programmatically inside the
      // drawer, and it can settle a few frames later — so poll briefly.
      const opener =
        openerRef.current ?? document.querySelector<HTMLElement>('[data-sidebar="trigger"]');
      openerRef.current = null;
      if (!opener) return;

      let tries = 0;
      let id = 0;
      const restore = () => {
        if (!document.contains(opener)) return;
        if (document.activeElement === document.body) opener.focus({ preventScroll: true });
        if (document.activeElement !== opener && tries++ < 8) id = window.setTimeout(restore, 60);
      };
      id = window.setTimeout(restore, 60);
      return () => window.clearTimeout(id);
    }



    const activeEl = document.activeElement;
    openerRef.current =
      activeEl instanceof HTMLElement && activeEl !== document.body
        ? activeEl
        : document.querySelector<HTMLElement>('[data-sidebar="trigger"]');


    // The drawer mounts its content asynchronously and Radix moves focus to the
    // first tabbable element on open, so poll briefly and claim focus after it.
    let cancelled = false;
    let attempts = 0;
    let timer = 0;

    const tick = () => {
      if (cancelled) return;
      const root = containerRef.current;
      const active =
        root?.querySelector<HTMLElement>('[data-nav-focusable][aria-current="page"]') ??
        root?.querySelector<HTMLElement>("[data-nav-focusable]");

      if (active) {
        active.scrollIntoView({ block: "center", behavior: "auto" });
        active.focus({ preventScroll: true });
        return;
      }
      if (attempts++ < 12) timer = window.setTimeout(tick, 60);
    };

    timer = window.setTimeout(tick, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [containerRef, open, enabled]);

}


/**
 * Containment for the open mobile drawer: a hard focus trap plus scroll lock.
 *
 * Radix already does both, but the drawer renders a long, dynamically expanding
 * nav tree — groups open and close while the drawer is up — and focus can land
 * outside the trap when the element that had focus is unmounted mid-interaction.
 * This layer re-cycles Tab/Shift+Tab across the *current* tabbable set on every
 * keypress and pins the body so iOS Safari does not rubber-band the page behind
 * the sheet.
 */
export function useMobileDrawerContainment(
  containerRef: RefObject<HTMLElement>,
  open: boolean,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !open) return;

    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    // Pin rather than `overflow:hidden` alone — iOS ignores the latter.
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const TABBABLE =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const tabbables = () => {
      const root = containerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? containerRef.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = tabbables();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Focus escaped the drawer (element unmounted) — pull it back in.
      if (!active || !items.includes(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [containerRef, open, enabled]);
}
