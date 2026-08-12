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
      // Drawer closed: hand focus back to the trigger. Runs after the sheet's own
      // close-focus handling, which lands on <body> once focus was moved
      // programmatically inside the drawer.
      const opener =
        openerRef.current ?? document.querySelector<HTMLElement>('[data-sidebar="trigger"]');
      openerRef.current = null;
      if (!opener) return;
      const id = window.setTimeout(() => {
        if (document.contains(opener) && document.activeElement === document.body) {
          opener.focus({ preventScroll: true });
        }
      }, 80);
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

