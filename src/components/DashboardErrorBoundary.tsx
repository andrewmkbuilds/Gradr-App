import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw, LayoutDashboard } from "lucide-react";
import { captureError } from "@/lib/telemetry/sentry";

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the pathname) clears a previous crash. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  errorId: string | null;
}

function newErrorId() {
  try {
    return crypto.randomUUID().slice(0, 8).toUpperCase();
  } catch {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}

/**
 * Boundary mounted inside the dashboard chrome. A crashing page renders a
 * friendly inline fallback while the sidebar and top bar stay interactive,
 * so navigation keeps working instead of the whole app going blank.
 */
export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: newErrorId() };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, errorId: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      boundary: "dashboard",
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      component_stack: info.componentStack?.slice(0, 2000),
    });
  }

  private reset = () => this.setState({ error: null, errorId: null });

  render() {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" data-dashboard-error-fallback className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center elev-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">This page hit a snag</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The rest of Gradr still works — use the menu to keep going, or retry this screen.
          </p>
          <p className="mt-4 break-words rounded-lg bg-muted/60 p-3 font-mono text-xs text-muted-foreground">
            {error.message || "Unexpected error."}
            {errorId ? <span className="block pt-1 opacity-70">Error ID: {errorId}</span> : null}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={this.reset}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RotateCw className="size-4" aria-hidden="true" />
              Try again
            </button>
            <a
              href="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default DashboardErrorBoundary;
