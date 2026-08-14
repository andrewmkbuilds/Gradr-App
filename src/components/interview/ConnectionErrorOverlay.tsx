import { AudioLines, Loader2, Keyboard, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voiceErrorCopy, type VoiceErrorCode } from "@/lib/interview/voiceErrors";

interface Props {
  open: boolean;
  /** Gradr-native code. Never a provider message. */
  code?: VoiceErrorCode | null;
  retrying?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Shown when the interviewer voice drops mid-interview.
 *
 * Restrained Yacht Club treatment — mahogany accent rather than a generic red
 * alert — with the transcript still visible behind the scrim. Copy is resolved
 * from the sanitized error code, so no provider wording can ever surface here.
 */
export function ConnectionErrorOverlay({ open, code, retrying, onRetry, onDismiss }: Props) {
  if (!open) return null;
  const copy = voiceErrorCopy(code);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="voice-error-title"
      aria-describedby="voice-error-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
    >
      <div className="elev-3 w-full max-w-md rounded-2xl border border-brand-secondary/25 p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/12 text-brand-secondary ring-1 ring-brand-secondary/25">
            <AudioLines className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="voice-error-title" className="font-display text-lg font-semibold leading-snug text-foreground">
              {copy.title}
            </h2>
            <p id="voice-error-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {copy.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {copy.retryable && (
            <Button onClick={onRetry} disabled={retrying} autoFocus className="min-h-11 flex-1">
              {retrying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {retrying ? "Reconnecting…" : "Retry voice"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onDismiss}
            autoFocus={!copy.retryable}
            className="min-h-11 flex-1"
          >
            <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" />
            Continue by typing
          </Button>
        </div>
      </div>
    </div>
  );
}
