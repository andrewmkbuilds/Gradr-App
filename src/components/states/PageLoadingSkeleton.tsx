import { SkeletonBlock } from "@/components/states";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type PageLoadingSkeletonProps = {
  variant?: "page" | "settings" | "admin" | "auth";
  className?: string;
};

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-6", className)} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      {children}
    </div>
  );
}

function Header() {
  return (
    <div className="space-y-3">
      <SkeletonBlock className="h-2.5 w-24 rounded-full" />
      <SkeletonBlock className="h-8 w-64 max-w-[80vw]" />
      <SkeletonBlock className="h-3.5 w-96 max-w-full" />
    </div>
  );
}

function Card({ rows = 3 }: { rows?: number }) {
  return (
    <Surface level={2} className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
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

export function PageLoadingSkeleton({ variant = "page", className }: PageLoadingSkeletonProps) {
  if (variant === "auth") {
    return (
      <Frame className={cn("mx-auto w-full max-w-md py-8", className)}>
        <Surface level={2} className="space-y-6 p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <SkeletonBlock className="mx-auto h-12 w-12 rounded-2xl" />
            <SkeletonBlock className="mx-auto h-7 w-44" />
            <SkeletonBlock className="mx-auto h-3.5 w-64 max-w-full" />
          </div>
          <div className="space-y-4">
            <SkeletonBlock className="h-11 w-full rounded-lg" />
            <SkeletonBlock className="h-11 w-full rounded-lg" />
            <SkeletonBlock className="h-11 w-full rounded-lg" />
          </div>
          <SkeletonBlock className="mx-auto h-3 w-36" />
        </Surface>
      </Frame>
    );
  }

  if (variant === "settings") {
    return (
      <Frame className={cn("mx-auto max-w-2xl", className)}>
        <Header />
        <Card rows={2} />
        <Card rows={5} />
        <Card rows={4} />
        <Card rows={3} />
      </Frame>
    );
  }

  if (variant === "admin") {
    return (
      <Frame className={className}>
        <Header />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Surface key={i} level={2} className="space-y-3 p-4">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-7 w-16" />
              <SkeletonBlock className="h-2 w-full rounded-full" />
            </Surface>
          ))}
        </div>
        <Surface level={2} className="space-y-4 p-5">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-56 w-full rounded-xl" />
        </Surface>
        <Card rows={5} />
      </Frame>
    );
  }

  return (
    <Frame className={className}>
      <Header />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card rows={4} />
        <Card rows={4} />
      </div>
      <Card rows={5} />
    </Frame>
  );
}
