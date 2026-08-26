import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isSandboxAvailable, sandboxFlags } from "@/lib/qa/sandbox/flags";
import { completeMockedOAuth, mockedCallbackUrl, recordHop, type MockProvider } from "@/lib/qa/sandbox/oauth";

/**
 * Mock identity provider.
 *
 * Plays the provider's part of the OAuth redirect: shows a consent screen,
 * then returns to the exact `redirect` the app requested. Deterministic and
 * offline, so Google/Apple/Microsoft sign-in redirects can be QA'd without
 * live client credentials.
 */
export default function QaOAuthMock() {
  const [params] = useSearchParams();
  const provider = (params.get("provider") ?? "google") as MockProvider;
  const redirect = params.get("redirect") ?? "/dashboard";
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = useMemo(() => mockedCallbackUrl(provider, redirect), [provider, redirect]);

  useEffect(() => {
    if (isSandboxAvailable() && sandboxFlags().oauth) {
      recordHop({ provider, stage: "callback", detail: `mock provider screen shown, target ${target}` });
    }
  }, [provider, target]);

  if (!isSandboxAvailable()) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-h3 font-display">Not available</h1>
        <p className="mt-4 text-body text-muted-foreground">The mock provider only runs on development and preview hosts.</p>
      </main>
    );
  }

  const approve = async () => {
    setBusy(true);
    const result = await completeMockedOAuth(provider, redirect);
    setStatus(result.message);
    setBusy(false);
    window.location.assign(target);
  };

  const deny = () => {
    recordHop({ provider, stage: "error", detail: "consent denied in the mock provider" });
    const url = new URL(redirect, window.location.origin);
    url.searchParams.set("qa_oauth_error", "access_denied");
    window.location.assign(url.toString());
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Helmet>
        <title>Mock {provider} sign-in — Gradr QA</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Card className="w-full p-6 stack-sm">
        <Badge variant="outline">QA sandbox</Badge>
        <h1 className="text-h4 font-display">Continue with {provider}</h1>
        <p className="text-body-sm text-muted-foreground">
          This is a simulated identity provider. Approving returns to{" "}
          <span className="break-all">{target}</span>.
        </p>
        {status && <p className="text-body-sm">{status}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={approve} disabled={busy}>{busy ? "Signing in…" : "Approve"}</Button>
          <Button variant="outline" onClick={deny} disabled={busy}>Deny</Button>
        </div>
      </Card>
    </main>
  );
}
