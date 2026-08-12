import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary mounted above the whole app so a single failing
 * component can never produce a completely blank page.
 */
export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Root error boundary caught:", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload Gradr
          </button>
        </div>
      </div>
    );
  }
}

export default RootErrorBoundary;
