import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, ExternalLink, Loader2, PlayCircle, RefreshCw, Save, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { voiceReasonCopy, toVoiceProviderReason } from "@/lib/interview/voiceErrors";

/**
 * Voice provider console.
 *
 * The credential itself is workspace-managed (Connectors) and never editable
 * from the browser — this page proves the key works, records exactly why it
 * doesn't, and owns the safe parts of the configuration: model, output format
 * and the per-persona voice ids used by every interview.
 */

interface PersonaRow { id: string; defaultVoiceId: string }

interface StatusPayload {
  credential: "present" | "missing";
  synthesis: "ok" | "failing" | "unavailable";
  code?: string | null;
  reason?: string | null;
  subscription?: { tier: string; charactersUsed: number; characterLimit: number; status: string } | null;
  config: { modelId: string; outputFormat: string; voiceOverrides: Record<string, string> };
  personas: PersonaRow[];
  recent: Array<{
    outcome: string;
    code: string | null;
    provider_reason: string | null;
    upstream_status: number | null;
    context: string;
    request_id?: string | null;
    persona_id?: string | null;
    created_at: string;
  }>;
}

interface LookupEvent {
  id: string;
  user_id: string | null;
  outcome: string;
  code: string | null;
  provider_reason: string | null;
  upstream_status: number | null;
  /** Server-side provider detail. Admin-only — never shown to candidates. */
  provider_detail: string | null;
  persona_id: string | null;
  context: string;
  request_id: string | null;
  created_at: string;
}

async function callDiagnostics(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("voice-diagnostics", { body });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export default function AdminVoiceSettings() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  interface TestResult {
  ok: boolean;
  audioBase64?: string;
  bytes?: number;
  ttfbMs?: number;
  code?: string;
  reason?: string;
  voiceId?: string;
  modelId?: string;
  upstreamStatus?: number;
}

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [modelId, setModelId] = useState("eleven_turbo_v2_5");
  const [outputFormat, setOutputFormat] = useState("mp3_44100_128");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ requestId: string; events: LookupEvent[] } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = (await callDiagnostics({ action: "status" })) as unknown as StatusPayload;
      setStatus(data);
      setModelId(data.config?.modelId ?? "eleven_turbo_v2_5");
      setOutputFormat(data.config?.outputFormat ?? "mp3_44100_128");
      setOverrides(data.config?.voiceOverrides ?? {});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load voice status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await callDiagnostics({ action: "save-config", modelId, outputFormat, voiceOverrides: overrides });
      toast.success("Voice configuration saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save configuration");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (personaId: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = (await callDiagnostics({ action: "stream-test", personaId })) as unknown as TestResult;
      setTestResult(data);
      if (data.ok && data.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
        audioRef.current = audio;
        await audio.play().catch(() => undefined);
        toast.success(`Streaming session OK — ${data.bytes} bytes, first byte in ${data.ttfbMs} ms`);
      } else {
        toast.error(`Streaming session failed — ${[data.code, data.reason].filter(Boolean).join(" · ")}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Stream test failed");
    } finally {
      setTesting(false);
    }
  };

  /** Resolve a candidate-quoted request id to the full server-side story. */
  const runLookup = async () => {
    const requestId = lookupId.trim();
    if (!requestId) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const data = (await callDiagnostics({ action: "lookup", requestId })) as { requestId: string; events?: LookupEvent[] };
      setLookupResult({ requestId: data.requestId, events: data.events ?? [] });
      if (!data.events?.length) toast.info("No voice events recorded for that request id");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  };

  const reasonCopy = useMemo(() => voiceReasonCopy(toVoiceProviderReason(status?.reason)), [status?.reason]);
  const healthy = status?.credential === "present" && status?.synthesis === "ok";

  return (
    <div className="page-shell space-y-6 py-6">
      <PageHeader
        eyebrow="Admin"
        title="Interviewer voice"
        description="Credential health, entitlement standing and the voice configuration used by every mock interview."
        icon={<AudioLines className="h-3.5 w-3.5" aria-hidden="true" />}
      />

      {loading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {healthy ? (
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
              )}
              <div>
                <p className="font-display font-semibold text-foreground">
                  {healthy ? "Speech service healthy" : "Speech service needs attention"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Credential {status?.credential === "present" ? "configured" : "missing"} · synthesis {status?.synthesis}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>

          {status?.subscription && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Provider plan</p>
                <p className="font-medium">{status.subscription.tier}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Account status</p>
                <p className="font-medium">{status.subscription.status}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Characters used</p>
                <p className="font-medium">
                  {status.subscription.charactersUsed.toLocaleString()} / {status.subscription.characterLimit.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {!healthy && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-foreground">{reasonCopy?.label ?? "Synthesis unavailable"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reasonCopy?.detail}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {[status?.code, status?.reason].filter(Boolean).join(" · ") || "no code"}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The API key is workspace-managed and can only be set or rotated in Connectors — it is never entered or
            displayed in the app. Rotate it there, then re-run the streaming test below.
            <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
          </p>
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Applied server-side to every interview turn. Leave a voice id blank to use the Gradr default.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="model">Speech model</Label>
            <Input id="model" value={modelId} onChange={(e) => setModelId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="format">Output format</Label>
            <Input id="format" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} />
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          {(status?.personas ?? []).map((p) => (
            <div key={p.id} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor={`voice-${p.id}`}>
                  {p.id} <span className="text-xs text-muted-foreground">(default {p.defaultVoiceId})</span>
                </Label>
                <Input
                  id={`voice-${p.id}`}
                  placeholder={p.defaultVoiceId}
                  value={overrides[p.id] ?? ""}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
              </div>
              <Button variant="outline" onClick={() => void runTest(p.id)} disabled={testing} className="min-h-11">
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Stream test
              </Button>
            </div>
          ))}
        </div>

        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
          Save configuration
        </Button>

        {testResult && (
          <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">
            {testResult.ok ? (
              <p>
                Realtime session verified — <strong>{(testResult.bytes ?? 0).toLocaleString()} bytes</strong> of audio,
                first byte in <strong>{testResult.ttfbMs} ms</strong>, voice {testResult.voiceId}, model {testResult.modelId}.
              </p>
            ) : (
              <p className="text-destructive">
                Session failed: {[testResult.code, testResult.reason].filter(Boolean).join(" · ")}
                {testResult.upstreamStatus ? ` (HTTP ${testResult.upstreamStatus})` : ""}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Search by request id</h2>
          <p className="text-sm text-muted-foreground">
            Paste the reference a candidate quoted from the voice error panel to see the sanitized
            error they were shown alongside the provider detail recorded server-side.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); void runLookup(); }}
        >
          <Label htmlFor="voice-request-id" className="sr-only">Request id</Label>
          <Input
            id="voice-request-id"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="e.g. 3f1c9a12-77b4-4f0a-9b1e-0f2c4d8a6e55"
            className="font-mono"
          />
          <Button type="submit" disabled={lookupLoading || !lookupId.trim()} className="shrink-0">
            {lookupLoading
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Search className="mr-2 h-4 w-4" aria-hidden="true" />}
            Look up
          </Button>
        </form>

        {lookupResult && (
          lookupResult.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing recorded for <span className="font-mono">{lookupResult.requestId}</span>.
            </p>
          ) : (
            <ul className="space-y-3">
              {lookupResult.events.map((e) => (
                <li key={e.id} className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={e.outcome === "ok" ? "outline" : "destructive"}>{e.outcome}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {[e.code, e.provider_reason, e.upstream_status ? `HTTP ${e.upstream_status}` : null]
                        .filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-foreground">Candidate shown</dt>
                      <dd>{voiceReasonCopy(toVoiceProviderReason(e.provider_reason))?.label ?? e.code ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Persona</dt>
                      <dd className="font-mono">{e.persona_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">User</dt>
                      <dd className="font-mono break-all">{e.user_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Context</dt>
                      <dd>{e.context}</dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-xs font-medium text-foreground">Provider detail (server-side)</p>
                    <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                      {e.provider_detail ?? "No detail recorded."}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Recent voice events</h2>
        {(status?.recent ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No voice events recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {status!.recent.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-2 last:border-0">
                <Badge variant={e.outcome === "ok" ? "outline" : "destructive"}>{e.outcome}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {[e.code, e.provider_reason, e.upstream_status ? `HTTP ${e.upstream_status}` : null].filter(Boolean).join(" · ") || "—"}
                </span>
                {e.request_id && (
                  <button
                    type="button"
                    onClick={() => { setLookupId(e.request_id!); void 0; }}
                    className="font-mono text-[11px] text-brand-secondary underline-offset-2 hover:underline"
                  >
                    {e.request_id.slice(0, 8)}…
                  </button>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {e.context} · {new Date(e.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
