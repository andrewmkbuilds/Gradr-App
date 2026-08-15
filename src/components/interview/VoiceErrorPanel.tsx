import { AudioLines, Keyboard, Loader2, RotateCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  voiceErrorCopy,
  voiceReasonCopy,
  type VoiceErrorCode,
  type VoiceProviderReason,
} from "@/lib/interview/voiceErrors";

interface Props {
  open: boolean;
  /** Gradr-native code. Never provider prose. */
  code?: VoiceErrorCode | null;
  /** Enumerated provider reason — e.g. an entitlement block. */
  reason?: VoiceProviderReason | null;
  /** Backend request id — quote it to support for an exact diagnosis. */
  requestId?: string | null;
  retrying?: boolean;
  onRetryAfterReconnect: () => void;
  onDismiss: () => void;
}

/**
 * Voice failure panel for the live interview.
 *
 * Explains entitlement problems in plain language (including the provider's
 * anti-abuse "unusual activity" hold), shows the exact codes for support, and
 * offers a single recovery action: reconnect the session and retry the same
 * turn — never a silent switch to a different voice provider.
 */
export function VoiceErrorPanel({ open, code, reason, requestId, retrying, onRetryAfterReconnect, onDismiss }: Props) {
  if (!open) return null;
  const copy = voiceErrorCopy(code);
  const reasonCopy = voiceReasonCopy(reason);
  const canRetry = copy.retryable && (reasonCopy?.reconnectHelps ?? true);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="voice-error-title"
      aria-describedby="voice-error-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="elev-3 w-full max-w-md rounded-2xl border border-border/60 p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-secondary/10 text-brand-secondary">
          {reason === "PROVIDER_UNUSUAL_ACTIVITY" ? (
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          ) : (
            <AudioLines className="h-6 w-6" aria-hidden="true" />
          )}
        </div>

        <h2 id="voice-error-title" className="font-display text-lg font-semibold text-foreground">
          {reasonCopy?.label ?? copy.title}
        </h2>
        <p id="voice-error-desc" className="mt-2 text-sm text-muted-foreground">
          {reasonCopy?.detail ?? copy.message}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your interview and transcript are safe.
        </p>

        {(code || reason || requestId) && (
          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {[code, reason, requestId].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {canRetry && (
            <Button onClick={onRetryAfterReconnect} disabled={retrying} className="min-h-11">
              {retrying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Retry after reconnect
            </Button>
          )}
          <Button variant="outline" onClick={onDismiss} className="min-h-11">
            <Keyboard className="mr-2 h-4 w-4" aria-hidden="true" />
            Continue by typing
          </Button>
        </div>
      </div>
    </div>
  );
}
