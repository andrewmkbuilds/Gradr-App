import { useNavigate } from "@/lib/router-compat";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type Notification } from "@/hooks/useNotifications";

export function NotificationsBell() {
  const navigate = useNavigate();
  const { data, unreadCount, markRead, markAllRead } = useNotifications();
  const items = data || [];

  const onClickItem = (n: Notification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-mahogany ring-2 ring-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">
            Notifications
            {unreadCount > 0 && (
              <span className="accent-chip ml-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="accent-link text-xs inline-flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center px-6">
              You're all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onClickItem(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-secondary/60 transition flex gap-3 ${
                      !n.read_at ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.read_at ? "bg-primary" : "bg-transparent"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">{n.title}</div>
                      {n.body && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
