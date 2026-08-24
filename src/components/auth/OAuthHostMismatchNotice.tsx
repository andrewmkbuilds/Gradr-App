/**
 * Recovery banner shown when an OAuth callback lands on the wrong host.
 *
 * The authorization code is bound to the origin that started the sign-in
 * (app.gradr.me). When hosting bounces the browser to the apex, the code can
 * no longer be exchanged — instead of a blank form, explain what happened and
 * offer a single action that restarts the flow on the correct domain.
 */
import { forwardRef, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ds/Button";
import {
  detectOAuthHostMismatch,
  recordOAuthHop,
  type OAuthHostMismatch,
} from "@/lib/oauth/forensics";

export const OAuthHostMismatchNotice = forwardRef<HTMLDivElement>(function OAuthHostMismatchNotice(_props, ref) {
  const [mismatch, setMismatch] = useState<OAuthHostMismatch | null>(null);

  useEffect(() => {
    const found = detectOAuthHostMismatch(window.location.href);
    if (!found) return;
    setMismatch(found);
    void recordOAuthHop({
      stage: "deviation",
      sourceUrl: document.referrer || undefined,
      finalUrl: `${window.location.origin}${window.location.pathname}`,
      deviationType: "apex_domain_bounce",
      note: "callback landed on the wrong host; recovery prompt shown",
      metadata: { actual_host: found.actualHost, expected_host: found.expectedHost },
    });
  }, []);

  if (!mismatch) return null;

  return (
    <div
      ref={ref}
      role="alert"
      className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-left"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Sign-in came back on the wrong domain
            </p>
            <p className="text-sm text-muted-foreground">
              Your provider sent you to{" "}
              <span className="font-medium text-foreground">{mismatch.actualHost}</span>, but the
              secure sign-in was started on{" "}
              <span className="font-medium text-foreground">{mismatch.expectedHost}</span>. That
              means the login code can't be used here. Nothing went wrong with your account — just
              retry from the app domain.
            </p>
          </div>
          <Button asChild className="h-10 gap-2">
            <a href={mismatch.retryUrl}>
              Retry on {mismatch.expectedHost}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
});
