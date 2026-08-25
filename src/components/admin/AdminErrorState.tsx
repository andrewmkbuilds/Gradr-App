import { useNavigate } from "react-router-dom";
import { ErrorState } from "@/components/states";
import { Button } from "@/design-system/gradr-9b9b95";
import { describeAdminError } from "@/lib/adminErrors";

/**
 * Single error surface for every admin panel.
 *
 * Turns a 401/403/404/5xx/offline failure into readable copy plus the only
 * action that can actually help (retry, or sign in again). Admin screens must
 * never render an empty container when the endpoint refuses them.
 */
export function AdminErrorState({
  error,
  resource = "this data",
  onRetry,
  isRetrying,
  className,
}: {
  error: unknown;
  /** Short noun phrase: "revenue metrics", "the delivery audit". */
  resource?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const info = describeAdminError(error, resource);

  return (
    <ErrorState
      className={className}
      title={info.title}
      description={info.description}
      reassurance={info.kind === "forbidden" ? false : "Nothing was lost — no admin data was changed."}
      onRetry={info.retryable && onRetry && !isRetrying ? onRetry : undefined}
      action={
        info.kind === "unauthenticated" ? (
          <Button variant="outline" onClick={() => navigate("/auth?next=" + encodeURIComponent(location.pathname))}>
            Sign in again
          </Button>
        ) : info.kind === "forbidden" ? (
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Back to dashboard
          </Button>
        ) : isRetrying ? (
          <span className="text-sm text-muted-foreground">Retrying…</span>
        ) : undefined
      }
    />
  );
}
