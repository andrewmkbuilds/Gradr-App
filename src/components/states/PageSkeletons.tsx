import { SkeletonBlock } from "@/components/states";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Route-shaped skeletons.
 *
 * These are not generic spinners: each one mirrors the real layout of the
 * page it stands in for — same masthead, same column rhythm, same card
 * heights — so a navigation lands on a page that is already the right shape
 * and simply fills in. Nothing shifts when the data arrives.
 */

function Masthead({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <SkeletonBlock className="h-2.5 w-28 rounded-full" />
          <SkeletonBlock className="h-8 w-64 max-w-[70vw]" />
          <SkeletonBlock className="h-3.5 w-80 max-w-[85vw]" />
        </div>
        {withActions && (
          <div className="flex gap-2">
            <SkeletonBlock className="h-10 w-24 rounded-lg" />
            <SkeletonBlock className="h-10 w-28 rounded-lg" />
          </div>
        )}
      </div>
      <SkeletonBlock className="mt-6 h-px w-full rounded-none" />
    </div>
  );
}

function StatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Surface key={i} level={2} className="space-y-3 p-4">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-2 w-full rounded-full" />
        </Surface>
      ))}
    </div>
  );
}

function PanelBlock({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <Surface level={2} className={cn("space-y-4 p-5", className)}>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-3.5 w-1/3" />
          <SkeletonBlock className="h-3 w-1/5" />
        </div>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBlock key={i} className={cn("h-3", i === rows - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </Surface>
  );
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Engine pages: masthead, input column, results column. */
export function EngineSkeleton() {
  return (
    <Frame label="Loading workspace">
      <Masthead />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="space-y-5">
          <Surface level={2} className="space-y-4 p-5">
            <SkeletonBlock className="h-3.5 w-32" />
            <SkeletonBlock className="h-32 w-full rounded-xl" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
          </Surface>
          <PanelBlock rows={3} />
        </div>
        <div className="space-y-5">
          <Surface level={2} className="flex items-center gap-6 p-6">
            <SkeletonBlock className="h-28 w-28 rounded-full" />
            <div className="flex-1 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBlock className="h-2.5 w-24" />
                  <SkeletonBlock className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </Surface>
          <PanelBlock rows={5} />
        </div>
      </div>
    </Frame>
  );
}

/** Dashboard: masthead, readiness band, stat row, two panels. */
export function DashboardSkeleton() {
  return (
    <Frame label="Loading dashboard">
      <Masthead />
      <Surface level={3} className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <SkeletonBlock className="h-32 w-32 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-4 w-48" />
          <SkeletonBlock className="h-3 w-full max-w-md" />
          <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
      </Surface>
      <StatRow />
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelBlock rows={4} />
        <PanelBlock rows={4} />
      </div>
    </Frame>
  );
}

/** List/table pages: masthead, filter bar, rows. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Frame label="Loading list">
      <Masthead />
      <Surface level={2} className="flex flex-wrap items-center gap-3 p-4">
        <SkeletonBlock className="h-10 min-w-[12rem] flex-1 rounded-lg" />
        <SkeletonBlock className="h-10 w-28 rounded-lg" />
        <SkeletonBlock className="h-10 w-24 rounded-lg" />
      </Surface>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Surface key={i} level={2} className="flex items-center gap-4 p-4">
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-3.5 w-1/3" />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
            <SkeletonBlock className="hidden h-8 w-20 rounded-full sm:block" />
          </Surface>
        ))}
      </div>
    </Frame>
  );
}

/** Marketing / long-form pages: hero band then stacked sections. */
export function MarketingSkeleton() {
  return (
    <Frame label="Loading page">
      <div className="space-y-4 py-10 text-center">
        <SkeletonBlock className="mx-auto h-3 w-36 rounded-full" />
        <SkeletonBlock className="mx-auto h-10 w-[min(34rem,90vw)]" />
        <SkeletonBlock className="mx-auto h-4 w-[min(24rem,80vw)]" />
        <div className="flex justify-center gap-3 pt-2">
          <SkeletonBlock className="h-11 w-36 rounded-lg" />
          <SkeletonBlock className="h-11 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PanelBlock key={i} rows={2} />
        ))}
      </div>
    </Frame>
  );
}

/** Admin dashboards: masthead, KPI row, chart, table. */
export function AdminSkeleton() {
  return (
    <Frame label="Loading admin view">
      <Masthead />
      <StatRow />
      <Surface level={2} className="space-y-4 p-5">
        <SkeletonBlock className="h-3.5 w-40" />
        <SkeletonBlock className="h-56 w-full rounded-xl" />
      </Surface>
      <ListSkeletonRows rows={5} />
    </Frame>
  );
}

function ListSkeletonRows({ rows }: { rows: number }) {
  return (
    <Surface level={2} className="divide-y divide-border/60 overflow-hidden p-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <SkeletonBlock className="h-3 w-1/4" />
          <SkeletonBlock className="h-3 w-1/5" />
          <SkeletonBlock className="ml-auto h-6 w-16 rounded-full" />
        </div>
      ))}
    </Surface>
  );
}

const ENGINE_ROUTES = ["/resume", "/match", "/apply", "/interview", "/growth", "/ats", "/career"];
const LIST_ROUTES = ["/jobs", "/pipeline", "/history", "/affiliate", "/settings", "/billing"];
const MARKETING_ROUTES = [
  "/pricing",
  "/blog",
  "/guides",
  "/legal",
  "/job-",
  "/ai-",
  "/welcome",
  "/brand",
];

/**
 * Picks the closest-shaped skeleton for a pathname. Used as the Suspense
 * fallback for lazily loaded routes so a chunk fetch never shows a spinner.
 */
export function RouteSkeleton({ pathname }: { pathname: string }) {
  const path = pathname.toLowerCase();
  if (path === "/" || path.startsWith("/dashboard")) return <DashboardSkeleton />;
  if (path.startsWith("/admin")) return <AdminSkeleton />;
  if (ENGINE_ROUTES.some((p) => path.startsWith(p))) return <EngineSkeleton />;
  if (LIST_ROUTES.some((p) => path.startsWith(p))) return <ListSkeleton />;
  if (MARKETING_ROUTES.some((p) => path.startsWith(p))) return <MarketingSkeleton />;
  return <EngineSkeleton />;
}
