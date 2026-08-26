import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Loader2,
  ShieldCheck,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Download,
  ScrollText,
  Bookmark,
  X,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { PageHeader } from "@/components/app/PageHeader";
import { toast } from "sonner";
import { formatAdminRpcError } from "@/lib/admin/adminRpc";
import {
  EMPTY_FILTERS,
  deletePreset,
  loadPresets,
  savePreset,
  type RpcAuditFilters,
  type RpcAuditPreset,
} from "@/lib/admin/auditPresets";
import { downloadBlob, streamAuditCsv } from "@/lib/admin/streamAuditCsv";
import { Button } from "@/components/ds/Button";
import {
  useAdminAuditLog,
  useAdminRpcAudit,
  useAuditActors,
  useLogAdminView,
  useRpcAuditRetention,
  useRunRpcAuditPurge,
  useUpdateRpcAuditRetention,
  type AuditEntry,
} from "@/hooks/useAdminAudit";

/** RFC4180-safe cell: quote everything, double embedded quotes. */
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;



const ACTION_META: Record<
  string,
  { icon: typeof Eye; label: string; cls: string }
> = {
  view: { icon: Eye, label: "Viewed", cls: "bg-secondary text-muted-foreground" },
  create: { icon: Plus, label: "Created", cls: "bg-primary/10 text-primary" },
  update: { icon: Pencil, label: "Modified", cls: "bg-warning/10 text-warning" },
  delete: { icon: Trash2, label: "Deleted", cls: "bg-destructive/10 text-destructive" },
  export: { icon: Download, label: "Exported", cls: "bg-primary/10 text-primary" },
};

const RESOURCE_LABEL: Record<string, string> = {
  affiliate_clicks: "Affiliate clicks",
  analytics_events: "Analytics events",
  affiliate_payouts: "Affiliate payouts",
};

export default function AdminAuditLog() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();

  const [resource, setResource] = useState("all");
  const [action, setAction] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [days, setDays] = useState(30);

  const { data: entries, isLoading } = useAdminAuditLog({ resource, action, actorId, days });
  const { data: actors } = useAuditActors();

  useLogAdminView("affiliate_clicks", entries?.length, !!isAdmin);

  const actorName = useMemo(() => {
    const map = new Map<string, string>();
    (actors || []).forEach((a) => map.set(a.user_id, a.display_name || a.user_id.slice(0, 8)));
    return map;
  }, [actors]);

  const counts = useMemo(() => {
    const c = { view: 0, update: 0, delete: 0, other: 0 };
    (entries || []).forEach((e) => {
      if (e.action === "view") c.view++;
      else if (e.action === "update") c.update++;
      else if (e.action === "delete") c.delete++;
      else c.other++;
    });
    return c;
  }, [entries]);

  if (loadingAdmin) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const selectCls =
    "px-3 py-2 rounded-control bg-secondary border border-border text-body-sm text-foreground";

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<ScrollText className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Audit log"
        description="Every admin view, modification, and deletion of affiliate click and analytics event records. Entries are append-only and cannot be edited or removed by anyone."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Views" value={counts.view} icon={Eye} />
        <StatTile label="Modifications" value={counts.update} icon={Pencil} />
        <StatTile label="Deletions" value={counts.delete} icon={Trash2} />
        <StatTile label="Other actions" value={counts.other} icon={ScrollText} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <select aria-label="Filter by resource" value={resource} onChange={(e) => setResource(e.target.value)} className={selectCls}>
          <option value="all">All resources</option>
          <option value="affiliate_clicks">Affiliate clicks</option>
          <option value="analytics_events">Analytics events</option>
          <option value="affiliate_payouts">Affiliate payouts</option>
        </select>
        <select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className={selectCls}>
          <option value="all">All actions</option>
          <option value="view">Viewed</option>
          <option value="create">Created</option>
          <option value="update">Modified</option>
          <option value="delete">Deleted</option>
          <option value="export">Exported</option>
        </select>
        <select aria-label="Filter by actor" value={actorId} onChange={(e) => setActorId(e.target.value)} className={selectCls}>
          <option value="all">Everyone</option>
          {(actors || []).map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.display_name || a.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          aria-label="Time range"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={selectCls}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      <div className="elev-2 rounded-card overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead className="text-left text-caption uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Record</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary inline" />
                </td>
              </tr>
            ) : (entries || []).length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No audit entries for these filters.
                </td>
              </tr>
            ) : (
              entries!.map((e) => <AuditRow key={e.id} entry={e} actorName={actorName} />)
            )}
          </tbody>
        </table>
      </div>

      <p className="text-caption text-muted-foreground">
        Repeat views by the same admin within 30 seconds are collapsed into one entry. Admin
        modifications and deletions are throttled to 50 per minute per account.
      </p>

      <RpcAuditSection actorName={actorName} actors={actors || []} />
    </div>
  );
}

function RpcAuditSection({
  actorName,
  actors,
}: {
  actorName: Map<string, string>;
  actors: { user_id: string; display_name: string | null }[];
}) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<RpcAuditFilters>(EMPTY_FILTERS);
  const [days, setDays] = useState(7);
  const [presets, setPresets] = useState<RpcAuditPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<number | null>(null);

  // The search box drives a query key, so it is debounced: one request per
  // pause, not one per keystroke against a 120/minute throttle.
  const debouncedSearch = useDebouncedValue(filters.search, 350);

  useEffect(() => {
    setPresets(loadPresets(user?.id));
  }, [user?.id]);

  const { data: calls, isLoading } = useAdminRpcAudit({
    fn: filters.fn,
    status: filters.status,
    actorId: filters.actorId,
    days,
    search: debouncedSearch,
    from: filters.from,
    to: filters.to,
  });

  const set = <K extends keyof RpcAuditFilters>(key: K, value: RpcAuditFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const functionNames = useMemo(
    () => Array.from(new Set((calls || []).map((c) => c.function_name))).sort(),
    [calls],
  );

  const selectCls =
    "px-3 py-2 rounded-control bg-secondary border border-border text-body-sm text-foreground";

  /**
   * Streams the *full* filtered result set — not just the 500 rows on screen —
   * page by page, so a month-wide export neither times out nor materialises
   * every row at once.
   */
  const exportCsv = async () => {
    setExporting(true);
    setExported(null);
    try {
      const { blob, rows } = await streamAuditCsv({
        filters: { ...filters, search: debouncedSearch },
        days,
        actorName,
      });
      if (rows === 0) {
        toast.info("No admin RPC calls match these filters.");
        return;
      }
      downloadBlob(blob, `admin-rpc-audit-${format(new Date(), "yyyy-MM-dd")}.csv`);
      setExported(rows);
      toast.success(`Exported ${rows.toLocaleString()} rows`);
    } catch (e) {
      toast.error(formatAdminRpcError(e));
    } finally {
      setExporting(false);
    }
  };

  const STATUS_CLS: Record<string, string> = {
    ok: "bg-primary/10 text-primary",
    denied: "bg-destructive/10 text-destructive",
    rate_limited: "bg-warning/10 text-warning",
  };

  return (
    <section className="page-stack">
      <div>
        <h2 className="type-h3 text-foreground">Admin RPC calls</h2>
        <p className="text-body-sm text-muted-foreground">
          Server-side record of every admin database function invocation — who called it, when,
          which function, the request id, and whether it was allowed, denied, or throttled. Written
          by the database guard itself, so it cannot be bypassed from the client.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <label className="text-caption text-muted-foreground">
          <span className="block mb-1">Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Function, request id, user agent"
            className={`w-64 ${selectCls}`}
          />
        </label>
        <select aria-label="Filter by function" value={filters.fn} onChange={(e) => set("fn", e.target.value)} className={selectCls}>
          <option value="all">All functions</option>
          {functionNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select aria-label="Filter by outcome" value={filters.status} onChange={(e) => set("status", e.target.value)} className={selectCls}>
          <option value="all">All outcomes</option>
          <option value="ok">Allowed</option>
          <option value="denied">Denied</option>
          <option value="rate_limited">Throttled</option>
        </select>
        <select aria-label="Filter RPC calls by actor" value={filters.actorId} onChange={(e) => set("actorId", e.target.value)} className={selectCls}>
          <option value="all">Everyone</option>
          {actors.map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.display_name || a.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          aria-label="RPC call time range"
          value={days}
          disabled={!!filters.from}
          onChange={(e) => setDays(Number(e.target.value))}
          className={selectCls}
        >
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <label className="text-caption text-muted-foreground">
          <span className="block mb-1">From</span>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => set("from", e.target.value)}
            className={selectCls}
          />
        </label>
        <label className="text-caption text-muted-foreground">
          <span className="block mb-1">To</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => set("to", e.target.value)}
            className={selectCls}
          />
        </label>
        <Button
          variant="outline"
          disabled={exporting}
          onClick={() => void exportCsv()}
          data-testid="export-rpc-audit"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
        <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
          Reset
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-caption text-muted-foreground">
          <span className="block mb-1">Save these filters as</span>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className={`w-48 ${selectCls}`}
          />
        </label>
        <Button
          variant="outline"
          disabled={!presetName.trim()}
          onClick={() => {
            setPresets(savePreset(user?.id, presetName, filters));
            setPresetName("");
            toast.success("Filter preset saved");
          }}
        >
          <Bookmark className="h-4 w-4" aria-hidden="true" /> Save preset
        </Button>
        {presets.map((p) => (
          <span
            key={p.name}
            className="inline-flex items-center gap-1 rounded-control bg-secondary border border-border pl-3 pr-1 py-1"
          >
            <button
              type="button"
              className="text-caption text-foreground"
              onClick={() => setFilters({ ...EMPTY_FILTERS, ...p.filters })}
            >
              {p.name}
            </button>
            <button
              type="button"
              aria-label={`Delete preset ${p.name}`}
              className="p-1 text-muted-foreground hover:text-destructive"
              onClick={() => setPresets(deletePreset(user?.id, p.name))}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      {exported !== null && (
        <p className="text-caption text-muted-foreground" role="status">
          Last export streamed {exported.toLocaleString()} rows.
        </p>
      )}


      <div className="elev-2 rounded-card overflow-x-auto">
        <table className="w-full text-body-sm">
          <caption className="sr-only">Admin RPC call audit</caption>
          <thead className="text-left text-caption uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">When</th>
              <th>Who</th>
              <th>Function</th>
              <th>Outcome</th>
              <th>Request id</th>
              <th>Client</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary inline" />
                </td>
              </tr>
            ) : (calls || []).length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-muted-foreground">
                  <ShieldCheck className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No admin RPC calls for these filters.
                </td>
              </tr>
            ) : (
              calls!.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3 text-caption text-muted-foreground whitespace-nowrap">
                    {format(new Date(c.created_at), "MMM d, yyyy HH:mm:ss")}
                  </td>
                  <td className="text-caption text-foreground">
                    {c.actor_id ? actorName.get(c.actor_id) || c.actor_id.slice(0, 8) : "anonymous"}
                  </td>
                  <td className="text-caption">
                    <code className="text-caption text-foreground">{c.function_name}</code>
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center text-overline px-2 py-0.5 rounded-full ${
                        STATUS_CLS[c.status] ?? "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {c.status === "ok" ? "Allowed" : c.status === "denied" ? "Denied" : "Throttled"}
                    </span>
                  </td>
                  <td>
                    <code className="text-caption text-muted-foreground">
                      {c.request_id ? c.request_id.slice(0, 12) : "—"}
                    </code>
                  </td>
                  <td className="text-caption text-muted-foreground max-w-56 truncate">
                    {c.ip ? `${c.ip} · ` : ""}
                    {c.user_agent ? c.user_agent.slice(0, 60) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-caption text-muted-foreground">
        Admin RPCs are throttled to 120 successful calls per minute per account; excess calls are
        rejected and recorded here as throttled.
      </p>

      <RetentionCard />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Retention & archival control
 * ------------------------------------------------------------------ */

function RetentionCard() {
  const { data: settings, isLoading, error: settingsError } = useRpcAuditRetention(true);
  const update = useUpdateRpcAuditRetention();
  const purge = useRunRpcAuditPurge();

  const [draft, setDraft] = useState<{
    retentionDays: number;
    archiveEnabled: boolean;
    archiveRetentionDays: number;
    purgeEnabled: boolean;
  } | null>(null);

  const current = draft ?? (settings
    ? {
        retentionDays: settings.retention_days,
        archiveEnabled: settings.archive_enabled,
        archiveRetentionDays: settings.archive_retention_days,
        purgeEnabled: settings.purge_enabled,
      }
    : null);

  if (settingsError) {
    // Surfacing the request id here is what makes a throttled or denied read
    // traceable straight back to its `admin_rpc_audit` row.
    return (
      <div
        role="alert"
        data-testid="retention-error"
        className="elev-2 rounded-card p-4 text-body-sm text-destructive"
      >
        {formatAdminRpcError(settingsError)}
      </div>
    );
  }

  if (isLoading || !current) {
    return (
      <div className="elev-2 rounded-card p-4 text-body-sm text-muted-foreground">
        Loading retention policy…
      </div>
    );
  }

  const inputCls =
    "w-24 px-3 py-2 rounded-control bg-secondary border border-border text-body-sm text-foreground";

  return (
    <div className="elev-2 rounded-card p-4 space-y-3">
      <div>
        <h3 className="text-body font-medium text-foreground">Retention &amp; archival</h3>
        <p className="text-caption text-muted-foreground">
          A nightly sweep moves call records older than the live window into the archive (or deletes
          them when archiving is off), then prunes archived records past their own window.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-caption text-muted-foreground">
          <span className="block mb-1">Keep live (days)</span>
          <input
            type="number"
            min={7}
            max={3650}
            className={inputCls}
            value={current.retentionDays}
            onChange={(e) => setDraft({ ...current, retentionDays: Number(e.target.value) })}
          />
        </label>
        <label className="text-caption text-muted-foreground">
          <span className="block mb-1">Keep archived (days)</span>
          <input
            type="number"
            min={7}
            max={3650}
            className={inputCls}
            value={current.archiveRetentionDays}
            onChange={(e) => setDraft({ ...current, archiveRetentionDays: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          <input
            type="checkbox"
            checked={current.archiveEnabled}
            onChange={(e) => setDraft({ ...current, archiveEnabled: e.target.checked })}
          />
          Archive before deleting
        </label>
        <label className="flex items-center gap-2 text-caption text-muted-foreground">
          <input
            type="checkbox"
            checked={current.purgeEnabled}
            onChange={(e) => setDraft({ ...current, purgeEnabled: e.target.checked })}
          />
          Automatic nightly sweep
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={update.isPending || !draft}
          onClick={() =>
            update.mutate(current, {
              onSuccess: () => {
                setDraft(null);
                toast.success("Retention policy saved");
              },
              onError: (e: Error) => toast.error(formatAdminRpcError(e)),
            })
          }
        >
          Save policy
        </Button>
        <Button
          variant="outline"
          disabled={purge.isPending}
          onClick={() =>
            purge.mutate(undefined, {
              onSuccess: (r) =>
                toast.success(
                  r?.skipped
                    ? "Sweep skipped — automatic clean-up is off"
                    : `Swept: ${Number(r?.archived ?? 0)} archived, ${Number(r?.deleted ?? 0)} deleted, ${Number(r?.archive_pruned ?? 0)} pruned`,
                ),
              onError: (e: Error) => toast.error(formatAdminRpcError(e)),
            })
          }
        >
          {purge.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
          Run sweep now
        </Button>
        {settings?.last_purge_at && (
          <span className="text-caption text-muted-foreground">
            Last sweep {format(new Date(settings.last_purge_at), "MMM d, yyyy HH:mm")}
          </span>
        )}
      </div>
    </div>
  );
}



function AuditRow({
  entry,
  actorName,
}: {
  entry: AuditEntry;
  actorName: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const meta = ACTION_META[entry.action] ?? ACTION_META.view;
  const Icon = meta.icon;
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <>
      <tr
        className={`border-t border-border ${hasDetails ? "cursor-pointer hover:bg-secondary/40" : ""}`}
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        <td className="p-3 text-caption text-muted-foreground whitespace-nowrap">
          {format(new Date(entry.created_at), "MMM d, yyyy HH:mm:ss")}
        </td>
        <td className="text-caption">
          {entry.actor_id ? (
            <span className="text-foreground">
              {actorName.get(entry.actor_id) || entry.actor_id.slice(0, 8)}
            </span>
          ) : (
            <span className="text-muted-foreground">system</span>
          )}
        </td>
        <td>
          <span
            className={`inline-flex items-center gap-1 text-overline px-2 py-0.5 rounded-full ${meta.cls}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
        </td>
        <td className="text-caption text-foreground">
          {RESOURCE_LABEL[entry.resource_type] || entry.resource_type}
        </td>
        <td>
          <code className="text-caption text-muted-foreground">
            {entry.resource_id ? entry.resource_id.slice(0, 8) : "—"}
          </code>
        </td>
        <td className="text-caption text-muted-foreground">{entry.record_count}</td>
      </tr>
      {open && hasDetails && (
        <tr className="border-t border-border bg-secondary/20">
          <td colSpan={6} className="p-3">
            <pre className="text-caption text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Eye;
}) {
  return (
    <div className="elev-2 rounded-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-caption">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="type-h1 text-foreground mt-1">{value}</div>
    </div>
  );
}
