import { useEffect } from "react";
import { useSyncExternalStore } from "react";

/**
 * Per-page SEO overrides.
 *
 * `RouteSeo` owns the single canonical/title/OG block for the whole app so no
 * two competing <link rel="canonical"> tags ever ship. Product surfaces whose
 * title should reflect live state (the role being matched, the resume being
 * scored) push a override into this tiny store instead of rendering a second
 * Helmet block.
 */
export interface SeoOverride {
  title?: string;
  description?: string;
  /** Canonical path override — defaults to the current pathname. */
  path?: string;
}

let current: SeoOverride | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setSeoOverride(next: SeoOverride | null) {
  current = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function useSeoOverrideValue(): SeoOverride | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Declare a dynamic title/description for the current screen. Cleared on
 * unmount so the static route metadata takes over again.
 */
export function useSeoOverride(override: SeoOverride | null) {
  const title = override?.title;
  const description = override?.description;
  const path = override?.path;

  useEffect(() => {
    if (!title && !description && !path) {
      setSeoOverride(null);
      return;
    }
    setSeoOverride({ title, description, path });
    return () => setSeoOverride(null);
  }, [title, description, path]);
}
