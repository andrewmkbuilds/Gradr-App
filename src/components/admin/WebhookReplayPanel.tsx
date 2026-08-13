import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Play, RefreshCw, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeliveryRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string | null;
  environment: string | null;
  state: string;
  attempts: number;
  replays: number | null;
  replay_of: string | null;
  last_error: string | null;
  signature_verified: boolean | null;
  created_at: string;
  payload?: unknown;
}

interface DryRunResult {
  mode: string;
  applied: boolean;
  edited?: boolean;
  effects?: string[];
  error?: string;
}

interface IdempotencyResult {
  resent: boolean;
  idempotent: boolean;
  claim: string;
  state?: string;
  ack?: { status: number; body: Record<string, unknown> };
  notes?: string[];
}


const ENDPOINT = "/api/public/admin-webhook-replay";

async function callReplayApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json['error'] ?? `Request failed (${res.status})`));
  return json as T;
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

/**
 * Webhook delivery log with a replay simulator.
 *
 * Operators can open any stored provider event, inspect the exact payload,
 * dry-run it to see what a replay would change, and only then apply it. Every
 * replay is written back as its own linked delivery row, so the log always
 * distinguishes real provider traffic from manual re-runs.
 */
export default function WebhookReplayPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DeliveryRow | null>(null);
  const [draft, setDraft] = useState("");
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [probe, setProbe] = useState<IdempotencyResult | null>(null);

  const [jsonError, setJsonError] = useState<string | null>(null);

  const deliveries = useQuery({
    queryKey: ["webhook-deliveries-admin"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await callReplayApi<{ deliveries: DeliveryRow[] }>({ action: "list", limit: 40 });
      return res.deliveries ?? [];
    },
  });

  const openDelivery = useMutation({
    mutationFn: async (id: string) => {
      const res = await callReplayApi<{ delivery: DeliveryRow }>({ action: "get", deliveryId: id });
      return res.delivery;
    },
    onSuccess: (delivery) => {
      setSelected(delivery);
      setDryRun(null);
      setProbe(null);

      setJsonError(null);
      setDraft(JSON.stringify(delivery.payload ?? {}, null, 2));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parseDraft = (): unknown | undefined => {
    if (!selected) return undefined;
    const original = JSON.stringify(selected.payload ?? {}, null, 2);
    if (draft.trim() === original.trim()) return undefined; // unedited → use stored payload
    try {
      const parsed = JSON.parse(draft);
      setJsonError(null);
      return parsed;
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
      throw new Error("Fix the JSON before running this replay.");
    }
  };

  const replay = useMutation({
    mutationFn: async (mode: "dry_run" | "live") => {
      if (!selected) throw new Error("No delivery selected");
      const payload = parseDraft();
      return callReplayApi<DryRunResult>({
        action: "replay",
        deliveryId: selected.id,
        mode,
        ...(payload !== undefined ? { payload } : {}),
      });
    },
    onSuccess: (result) => {
      setDryRun(result);
      if (result.applied) {
        toast.success("Replay applied");
        queryClient.invalidateQueries({ queryKey: ["webhook-deliveries-admin"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Re-sends the untouched stored body through the endpoint's claim step and
  // reports the ack the provider would get. Safe to run on processed events.
  const idempotency = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No delivery selected");
      return callReplayApi<IdempotencyResult>({
        action: "idempotency",
        deliveryId: selected.id,
      });
    },
    onSuccess: (result) => {
      setProbe(result);
      if (result.idempotent) toast.success("Duplicate acked — idempotency holds");
      else if (result.resent) toast.error("Idempotency did not hold");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Webhook className="h-4 w-4 text-primary" aria-hidden="true" /> Webhook deliveries
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => deliveries.refetch()}
          disabled={deliveries.isFetching}
        >
          {deliveries.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {deliveries.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading deliveries…</p>
      ) : deliveries.error ? (
        <p className="text-sm text-destructive">{(deliveries.error as Error).message}</p>
      ) : (deliveries.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No webhook events received yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {(deliveries.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
              <Badge
                variant="outline"
                className={
                  d.state === "processed"
                    ? "text-success"
                    : d.state === "failed"
                      ? "text-destructive"
                      : "text-warning"
                }
              >
                {d.state}
              </Badge>
              <span className="text-sm font-medium text-foreground">{d.provider}</span>
              {d.replay_of && (
                <Badge variant="secondary" className="text-xs">
                  replay
                </Badge>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {d.event_type ?? "event"} · {d.event_id} · {d.attempts} attempt(s)
                {d.replays ? ` · ${d.replays} replay(s)` : ""} · {timeAgo(d.created_at)}
                {d.last_error ? ` · ${d.last_error}` : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDelivery.mutate(d.id)}
                disabled={openDelivery.isPending}
              >
                Inspect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
              Replay simulator
            </DialogTitle>
            <DialogDescription>
              {selected?.provider} · {selected?.event_type ?? "event"} · {selected?.event_id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <AlertDescription className="text-xs">
                Dry run explains what a replay would change and writes nothing. A live replay skips
                signature checks (the payload was verified on arrival) and is logged as its own
                delivery linked to this one.
              </AlertDescription>
            </Alert>

            <div>
              <label htmlFor="replay-payload" className="mb-1 block text-xs font-medium text-muted-foreground">
                Stored payload (editable for simulation)
              </label>
              <Textarea
                id="replay-payload"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDryRun(null);
                }}
                spellCheck={false}
                className="h-56 font-mono text-xs"
              />
              {jsonError && <p className="mt-1 text-xs text-destructive">{jsonError}</p>}
            </div>

            {dryRun && (
              <Alert variant={dryRun.error ? "destructive" : "default"}>
                <AlertDescription className="space-y-1 text-xs">
                  <p className="font-medium">
                    {dryRun.error
                      ? "Replay failed"
                      : dryRun.applied
                        ? "Replay applied"
                        : "Dry run — nothing was changed"}
                  </p>
                  {dryRun.error ? (
                    <p>{dryRun.error}</p>
                  ) : (
                    <ul className="list-disc pl-4">
                      {(dryRun.effects ?? []).map((eff) => (
                        <li key={eff}>{eff}</li>
                      ))}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => replay.mutate("dry_run")}
                disabled={replay.isPending}
              >
                {replay.isPending && replay.variables === "dry_run" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FlaskConical className="mr-2 h-4 w-4" />
                )}
                Dry run
              </Button>
              <Button onClick={() => replay.mutate("live")} disabled={replay.isPending}>
                {replay.isPending && replay.variables === "live" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Replay for real
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
