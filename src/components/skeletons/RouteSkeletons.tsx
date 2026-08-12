import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Branded per-route loading states.
 *
 * Each skeleton mirrors the layout of the section it stands in for, so the
 * transition into real content is a fill-in rather than a repaint.
 */

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("animate-in fade-in space-y-6 p-4 duration-200 md:p-6", className)}
    >
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

function Header({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className={cn("h-8", wide ? "w-72" : "w-52")} />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

function Cards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card/40 p-4">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-8 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function Rows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Shell>
      <Header wide />
      <Cards />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Rows count={3} />
    </Shell>
  );
}

export function ResumeSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-[26rem] rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </Shell>
  );
}

export function JobsSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <Rows count={6} />
    </Shell>
  );
}

export function InterviewSkeleton() {
  return (
    <Shell>
      <Header wide />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </Shell>
  );
}

export function PipelineSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function TableSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="overflow-hidden rounded-xl border border-border/60">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="space-y-px p-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

export function SettingsSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
            <Skeleton className="h-10 w-full max-w-md rounded-md" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function BillingSkeleton() {
  return (
    <Shell>
      <Header />
      <Cards count={3} className="lg:grid-cols-3" />
      <Skeleton className="h-56 rounded-xl" />
    </Shell>
  );
}

export function GenericSkeleton() {
  return (
    <Shell>
      <Header />
      <Cards count={3} className="lg:grid-cols-3" />
      <Rows count={4} />
    </Shell>
  );
}
