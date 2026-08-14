import { CheckCircle2, FileSearch, Mail, MessageSquare, ShieldAlert, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  id: string;
  event: string;
  actor_role: "user" | "admin" | "system";
  actor_name: string | null;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  created_at: string;
}

const EVENT_COPY: Record<string, { label: string; icon: LucideIcon }> = {
  submitted: { label: "Request submitted", icon: UserCheck },
  fraud_screened: { label: "Automatic checks completed", icon: ShieldAlert },
  decision_recorded: { label: "Reviewer decision", icon: CheckCircle2 },
  appeal_submitted: { label: "Appeal submitted", icon: MessageSquare },
  email_sent: { label: "Status email sent", icon: Mail },
  email_failed: { label: "Status email could not be delivered", icon: Mail },
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Chronological audit trail of everything that happened to a verification
 * request — who did it, when, and any note they left.
 */
export function VerificationTimeline({
  entries,
  className,
  emptyLabel = "Nothing recorded yet.",
}: {
  entries: TimelineEntry[];
  className?: string;
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{emptyLabel}</p>;
  }

  return (
    <ol className={cn("relative space-y-4 border-l border-border pl-5", className)}>
      {entries.map((entry) => {
        const copy = EVENT_COPY[entry.event] ?? {
          label: entry.event.replace(/_/g, " "),
          icon: FileSearch,
        };
        const Icon = copy.icon;
        return (
          <li key={entry.id} className="relative">
            <span
              className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background"
              aria-hidden="true"
            >
              <Icon className="h-2.5 w-2.5 text-primary" />
            </span>
            <p className="text-sm font-medium text-foreground">{copy.label}</p>
            <p className="text-xs text-muted-foreground">
              {entry.actor_name ?? "Gradr"} · {formatWhen(entry.created_at)}
              {entry.to_status ? ` · ${entry.to_status.replace(/_/g, " ")}` : ""}
            </p>
            {entry.notes && (
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                {entry.notes}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
