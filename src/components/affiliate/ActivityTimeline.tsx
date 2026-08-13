import { format } from "date-fns";
import { MousePointerClick, UserPlus, DollarSign, Banknote, RotateCcw } from "lucide-react";

export type TimelineEvent = {
  id: string;
  at: string;
  kind: "click" | "referral" | "commission" | "payout" | "reversal";
  title: string;
  detail?: string;
};

const ICONS = {
  click: MousePointerClick,
  referral: UserPlus,
  commission: DollarSign,
  payout: Banknote,
  reversal: RotateCcw,
} as const;

const TONE = {
  click: "text-muted-foreground bg-secondary",
  referral: "text-primary bg-primary/10",
  commission: "text-success bg-success/10",
  payout: "text-success bg-success/10",
  reversal: "text-destructive bg-destructive/10",
} as const;

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="elev-2 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Referral activity</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nothing yet. Your clicks, signups and commissions will appear here in real time.
        </p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {events.map((e) => {
            const Icon = ICONS[e.kind];
            return (
              <li key={e.id} className="relative flex gap-3 pl-0">
                <span className={`relative z-10 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${TONE[e.kind]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground">{e.title}</div>
                  {e.detail && <div className="text-xs text-muted-foreground truncate">{e.detail}</div>}
                </div>
                <time className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(e.at), "MMM d, HH:mm")}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
