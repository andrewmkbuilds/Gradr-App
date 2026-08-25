import { useState } from "react";
import { FlaskConical, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMAIL_TEMPLATE_CATALOG } from "@/lib/email/templateCatalog";

interface Decision {
  recipient: string;
  wouldSend: boolean;
  blockedBy: string | null;
  reason: string | null;
}

interface DryRunResult {
  templateName: string;
  subject: string;
  html: string;
  renderError: string | null;
  templateBlocked: string | null;
  category: string;
  decisions: Decision[];
}

/**
 * Template test sandbox.
 *
 * Runs the exact gate chain of the send path — classification, category
 * preference, suppression list, used unsubscribe token — and reports which
 * recipients would be blocked. It never queues or sends: the edge function has
 * no path to `enqueue_email`.
 */
export function EmailTemplateSandbox() {
  const [templateName, setTemplateName] = useState(EMAIL_TEMPLATE_CATALOG[0]?.name ?? "");
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRecipient, setPreviewRecipient] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ recipient: string; subject: string; html: string } | null>(null);

  const recipientList = recipientsRaw
    .split(/[\s,;]+/)
    .map((r) => r.trim())
    .filter(Boolean);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    const recipients = recipientList;
    const { data, error: fnError } = await supabase.functions.invoke("email-template-dry-run", {
      body: { templateName, recipients },
    });
    setRunning(false);
    if (fnError) {
      setError(fnError.message);
      return;
    }
    if ((data as { error?: string })?.error) {
      setError((data as { error: string }).error);
      return;
    }
    setResult(data as DryRunResult);
  };

  /**
   * Render-only preview. `previewOnly` tells the edge function to skip the gate
   * evaluation and the audit write entirely — nothing is queued, nothing is
   * sent, and no delivery record is created.
   */
  const runPreview = async () => {
    setPreviewing(true);
    setError(null);
    setPreview(null);
    const { data, error: fnError } = await supabase.functions.invoke("email-template-dry-run", {
      body: { templateName, previewOnly: true, previewRecipient: previewRecipient || null },
    });
    setPreviewing(false);
    if (fnError) {
      setError(fnError.message);
      return;
    }
    const payload = data as DryRunResult & { error?: string };
    if (payload?.error) {
      setError(payload.error);
      return;
    }
    if (payload.renderError) {
      setError(`Render failed: ${payload.renderError}`);
      return;
    }
    setPreview({
      recipient: previewRecipient || "Generic preview data",
      subject: payload.subject,
      html: payload.html,
    });
  };


  return (
    <Card className="p-5 elev-1 space-y-4">
      <div>
        <h2 className="text-body-sm font-semibold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Template test sandbox
        </h2>
        <p className="text-caption text-muted-foreground mt-1">
          Dry-run any template against real recipients. Nothing is queued or sent — the run only reports which
          recipients the preferences, suppression list and classification rules would block.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sandbox-template">Template</Label>
          <Select value={templateName} onValueChange={setTemplateName}>
            <SelectTrigger id="sandbox-template">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_TEMPLATE_CATALOG.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sandbox-recipients">Recipients (comma or newline separated)</Label>
          <Input
            id="sandbox-recipients"
            value={recipientsRaw}
            onChange={(e) => setRecipientsRaw(e.target.value)}
            placeholder="person@example.com, other@example.com"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={run} loading={running} disabled={!templateName}>
          Run dry-run
        </Button>
        <span className="text-caption text-muted-foreground">Dry-runs are recorded in the delivery audit log.</span>
      </div>

      {error && <p className="text-body-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="rounded-control border border-border/60 p-3">
            <p className="text-body-sm font-medium">Subject</p>
            <p className="text-caption text-muted-foreground mt-1">
              {result.renderError ? `Render failed: ${result.renderError}` : result.subject || "(empty)"}
            </p>
            {result.templateBlocked && (
              <p className="text-caption text-destructive mt-2">
                Template gate: {result.templateBlocked} — this template can never be queued.
              </p>
            )}
          </div>

          <div>
            <p className="text-body-sm font-medium mb-2">Recipient outcomes</p>
            {result.decisions.length === 0 ? (
              <p className="text-caption text-muted-foreground">Add at least one recipient to evaluate delivery rules.</p>
            ) : (
              <div className="divide-y divide-border/60 rounded-control border border-border/60">
                {result.decisions.map((d) => (
                  <div key={d.recipient} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <span className="text-body-sm">{d.recipient}</span>
                    <div className="flex items-center gap-2">
                      {d.wouldSend ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Would send
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Blocked · {d.blockedBy}
                        </Badge>
                      )}
                      <span className="text-caption text-muted-foreground">{d.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!result.renderError && result.html && (
            <div className="space-y-1.5">
              <Label htmlFor="sandbox-html">Rendered HTML (not sent)</Label>
              <Textarea id="sandbox-html" readOnly value={result.html} className="h-40 font-mono text-code" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default EmailTemplateSandbox;
