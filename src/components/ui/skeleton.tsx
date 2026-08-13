import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-sheen elev-1 rounded-md", className)} {...props} />;
}

export { Skeleton };
