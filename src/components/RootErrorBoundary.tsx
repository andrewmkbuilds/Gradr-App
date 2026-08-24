import { buttonVariants } from "@/design-system/gradr-9b9b95/gradr/components/button";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, LifeBuoy, Home, RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorId: string | null;
  componentStack: string | null;
}

const SUPPORT_EMAIL = "support@gradr.me";

function newErrorId() {
  try {
    return crypto.randomUUID().slice(0, 8).toUpperCase();
  } catch {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}

/**
 * Last-resort boundary mounted above the whole app so a single failing
 * component can never produce a completely blank page. Renders a branded
 * recovery screen with retry / reload / home / contact-support actions.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, errorId: newErrorId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error("Root error boundary caught:", error, info.componentStack);
    // Surface to telemetry when Sentry is installed, without hard-depending on it.
    const sentry = (window as unknown as { Sentry?: { captureException?: (e: unknown) => void } }).Sentry;
    sentry?.captureException?.(error);
  }

  private reset = () => this.setState({ error: null, errorId: null, componentStack: null });

  private supportHref() {
    const { error, errorId } = this.state;
    const body = [
      "Hi Gradr team,",
      "",
      "I hit an error in the app.",
      `Error ID: ${errorId ?? "n/a"}`,
      `Message: ${error?.message ?? "unknown"}`,
      `Page: ${typeof window !== "undefined" ? window.location.href : ""}`,
    ].join("\n");
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      `Gradr error ${this.state.errorId ?? ""}`.trim(),
    )}&body=${encodeURIComponent(body)}`;
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { error, errorId } = this.state;

    return (
      <div
        role="alert"
        data-app-error-screen
        className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground"
      >
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gradr hit an unexpected error and stopped rendering this screen. Your data is safe — try again, or
            reload the app.
          </p>

          <p className="mt-4 break-words rounded-lg bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
            {error.message || "An unexpected error occurred."}
            {errorId ? <span className="block pt-1 opacity-70">Error ID: {errorId}</span> : null}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => window.location.reload()}
            >
              <RotateCw className="size-4" aria-hidden="true" />
              Reload Gradr
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={this.reset}
            >
              Try again
            </button>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              href="/"
            >
              <Home className="size-4" aria-hidden="true" />
              Go home
            </a>
            <a
              className={buttonVariants({ variant: "link", size: "md" })}
              href={this.supportHref()}
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              Contact support
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default RootErrorBoundary;
