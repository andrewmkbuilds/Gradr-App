import { AlertTriangle, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  title?: string;
  message?: string;
  retrying?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Full-surface overlay shown when realtime streaming drops mid-interview.
 * Keeps the transcript visible behind a blur and offers one-click recovery.
 */
export function ConnectionErrorOverlay({
  open,
  title = "Realtime connection lost",
  message = "Your transcript is safe. Reconnect to carry on with voice, or keep going by typing your answers.",
  retrying,
  onRetry,
  onDismiss,
}: Props) {
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conn-error-title"
      aria-describedby="conn-error-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
    >
      <div className="elev-2 rounded-xl w-full max-w-md p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>
        <h2 id="conn-error-title" className="mt-4 text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p id="conn-error-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onRetry} disabled={retrying} autoFocus className="min-h-11">
            {retrying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {retrying ? "Reconnecting…" : "Retry connection"}
          </Button>
          <Button variant="outline" onClick={onDismiss} className="min-h-11">
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            Continue by typing
          </Button>
        </div>
      </div>
    </div>
  );
}
