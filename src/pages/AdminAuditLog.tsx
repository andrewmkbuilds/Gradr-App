import { useMemo, useState } from "react";
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
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { PageHeader } from "@/components/app/PageHeader";
import {
  useAdminAuditLog,
  useAuditActors,
  useLogAdminView,
  type AuditEntry,
} from "@/hooks/useAdminAudit";

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
    "px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground";

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
        <select value={resource} onChange={(e) => setResource(e.target.value)} className={selectCls}>
          <option value="all">All resources</option>
          <option value="affiliate_clicks">Affiliate clicks</option>
          <option value="analytics_events">Analytics events</option>
          <option value="affiliate_payouts">Affiliate payouts</option>
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={selectCls}>
          <option value="all">All actions</option>
          <option value="view">Viewed</option>
          <option value="create">Created</option>
          <option value="update">Modified</option>
          <option value="delete">Deleted</option>
          <option value="export">Exported</option>
        </select>
        <select value={actorId} onChange={(e) => setActorId(e.target.value)} className={selectCls}>
          <option value="all">Everyone</option>
          {(actors || []).map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.display_name || a.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
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

      <div className="elev-2 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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

      <p className="text-xs text-muted-foreground">
        Repeat views by the same admin within 30 seconds are collapsed into one entry. Admin
        modifications and deletions are throttled to 50 per minute per account.
      </p>
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
        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(entry.created_at), "MMM d, yyyy HH:mm:ss")}
        </td>
        <td className="text-xs">
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
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.cls}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
        </td>
        <td className="text-xs text-foreground">
          {RESOURCE_LABEL[entry.resource_type] || entry.resource_type}
        </td>
        <td>
          <code className="text-[11px] text-muted-foreground">
            {entry.resource_id ? entry.resource_id.slice(0, 8) : "—"}
          </code>
        </td>
        <td className="text-xs text-muted-foreground">{entry.record_count}</td>
      </tr>
      {open && hasDetails && (
        <tr className="border-t border-border bg-secondary/20">
          <td colSpan={6} className="p-3">
            <pre className="text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
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
    <div className="elev-2 rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="type-h1 text-foreground mt-1">{value}</div>
    </div>
  );
}
