import { useEffect, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/AuthLayout";
import { Shield, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { describeRedirectTarget, evaluateClientName } from "@/lib/oauth/clientTrust";

// Beta namespace typing shim
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization request.");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) return setError(error.message ?? "Could not load authorization request.");
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load authorization.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        return setError(error.message ?? "Authorization failed.");
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        return setError("No redirect returned by the authorization server.");
      }
      window.location.href = target;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Authorization failed.");
    }
  }

  if (error) {
    return (
      <AuthLayout>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Authorization error</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </AuthLayout>
    );
  }

  if (!details) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  // The name comes from the third party, so it is sanitised and vetted before
  // it is ever painted onto a gradr.me page.
  const verdict = evaluateClientName(details.client?.name ?? details.client?.client_name);
  const target = describeRedirectTarget(details.client?.redirect_uris?.[0] ?? details.redirect_uri);
  const blocked = verdict.suspicious && !acknowledged;

  return (
    <AuthLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Authorize a third-party app</h2>
            <p className="text-sm text-muted-foreground">
              You are signed in to Gradr. An external application is requesting access to your Gradr data.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">App name (provided by the app, not verified by Gradr)</p>
            <p className="font-mono text-foreground break-all">{verdict.displayName || "Unnamed application"}</p>
          </div>
          {target && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Approving sends you to</p>
              <p className="font-mono text-foreground break-all flex items-start gap-1">
                <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {target.url}
              </p>
              {target.insecure && (
                <p className="text-xs text-destructive mt-1">This destination is not using a secure (HTTPS) connection.</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">It would be able to</p>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-foreground">Read your Gradr profile, resumes, job matches, and pipeline</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-foreground">Add jobs to your pipeline on your behalf</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Row-level security still applies to every request. Gradr never asks you to approve an app to keep your
            account active, and never asks for your password or payment details on this page.
          </p>
        </div>

        {verdict.suspicious && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">This request looks unsafe</p>
                {verdict.reasons.map((reason) => (
                  <p key={reason} className="text-muted-foreground">{reason}</p>
                ))}
                <p className="text-muted-foreground">If you did not start this yourself, cancel now.</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--destructive))]"
              />
              I started this request and I trust this application.
            </label>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => decide(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-11 bg-primary text-primary-foreground"
            onClick={() => decide(true)}
            disabled={busy || blocked}
          >
            {busy ? "Working..." : "Approve access"}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
