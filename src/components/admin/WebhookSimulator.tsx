/**
 * Webhook payload generator + signature verification harness.
 *
 * Builds a realistic Paddle or RevenueCat event body, signs it with the same
 * scheme the live endpoint expects (server-side — the signing secret never
 * reaches the browser), posts it to the real endpoint, and reports the
 * status, signature verdict and idempotency acknowledgement.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ENDPOINT = "/api/public/admin-webhook-simulate";

type Provider = "paddle" | "revenuecat";

const EVENTS: Record<Provider, string[]> = {
  paddle: [
    "subscription.created",
    "subscription.updated",
    "subscription.canceled",
    "transaction.completed",
    "transaction.payment_failed",
  ],
  revenuecat: ["INITIAL_PURCHASE", "RENEWAL", "CANCELLATION", "BILLING_ISSUE", "EXPIRATION"],
};

interface SimulateResult {
  status: number;
  signatureVerified: boolean;
  idempotent: boolean;
  duplicateOfFirst?: boolean;
  body: unknown;
  firstBody?: unknown;
}

function samplePayload(provider: Provider, eventType: string, eventId: string) {
  if (provider === "paddle") {
    return {
      event_id: eventId,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      data: {
        id: "sub_test_0000",
        status: eventType === "subscription.canceled" ? "canceled" : "active",
        customer_id: "ctm_test_0000",
        custom_data: { user_id: "00000000-0000-0000-0000-000000000000" },
        items: [{ price: { id: "pri_test_monthly" }, quantity: 1 }],
      },
    };
  }
  return {
    api_version: "1.0",
    event: {
      id: eventId,
      type: eventType,
      app_user_id: "00000000-0000-0000-0000-000000000000",
      product_id: "gradr_pro_monthly",
      period_type: "NORMAL",
      environment: "SANDBOX",
      event_timestamp_ms: Date.now(),
      expiration_at_ms: Date.now() + 30 * 86_400_000,
    },
  };
}

export function WebhookSimulator() {
  const [provider, setProvider] = useState<Provider>("paddle");
  const [eventType, setEventType] = useState(EVENTS.paddle[0] as string);
  const [signValid, setSignValid] = useState(true);
  const [checkIdempotency, setCheckIdempotency] = useState(true);
  const [eventId, setEventId] = useState(() => `evt_sim_${Date.now()}`);
  const [body, setBody] = useState<string>(() =>
    JSON.stringify(samplePayload("paddle", "subscription.created", `evt_sim_${Date.now()}`), null, 2),
  );
  const [result, setResult] = useState<SimulateResult | null>(null);

  const parsed = useMemo(() => {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }, [body]);

  function regenerate(nextProvider: Provider, nextEvent: string) {
    const id = `evt_sim_${Date.now()}`;
    setEventId(id);
    setBody(JSON.stringify(samplePayload(nextProvider, nextEvent, id), null, 2));
    setResult(null);
  }

  const run = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired — sign in again.");

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider,
          eventType,
          eventId,
          payload: JSON.parse(body),
          signValid,
          checkIdempotency,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(json['error'] ?? `Request failed (${res.status})`));
      return json as unknown as SimulateResult;
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Endpoint responded ${r.status}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden />
            Webhook simulator
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate a signed test payload and confirm signature handling and idempotency on the
            live endpoint. Test events are tagged and never touch real subscriptions.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Provider</Label>
          <Select
            value={provider}
            onValueChange={(v) => {
              const p = v as Provider;
              const first = EVENTS[p][0] as string;
              setProvider(p);
              setEventType(first);
              regenerate(p, first);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paddle">Paddle</SelectItem>
              <SelectItem value="revenuecat">RevenueCat</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Event type</Label>
          <Select
            value={eventType}
            onValueChange={(v) => {
              setEventType(v);
              regenerate(provider, v);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENTS[provider].map((e) => (
                <SelectItem key={e} value={e} className="text-xs">
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Payload</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
        />
        {!parsed && <p className="text-xs text-destructive">Payload is not valid JSON.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <span className="text-xs text-foreground">
            Sign with the real secret
            <span className="block text-[11px] text-muted-foreground">
              Off = send a bad signature and expect a 401.
            </span>
          </span>
          <Switch checked={signValid} onCheckedChange={setSignValid} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <span className="text-xs text-foreground">
            Send twice
            <span className="block text-[11px] text-muted-foreground">
              Verifies the duplicate is acknowledged, not reprocessed.
            </span>
          </span>
          <Switch checked={checkIdempotency} onCheckedChange={setCheckIdempotency} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run.mutate()} disabled={!parsed || run.isPending} size="sm">
          {run.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />}
          Send test webhook
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenerate(provider, eventType)}
          disabled={run.isPending}
        >
          New payload
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground">{eventId}</span>
      </div>

      {result && (
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={result.status < 300 ? "secondary" : "destructive"}>
              HTTP {result.status}
            </Badge>
            <Badge
              variant={result.signatureVerified ? "secondary" : "destructive"}
              className="gap-1"
            >
              {result.signatureVerified ? (
                <ShieldCheck className="h-3 w-3" aria-hidden />
              ) : (
                <ShieldX className="h-3 w-3" aria-hidden />
              )}
              {result.signatureVerified ? "Signature valid" : "Signature rejected"}
            </Badge>
            {checkIdempotency && (
              <Badge variant={result.idempotent ? "secondary" : "destructive"}>
                {result.idempotent ? "Idempotent ack" : "Duplicate reprocessed"}
              </Badge>
            )}
          </div>
          <pre className="max-h-52 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

export default WebhookSimulator;
