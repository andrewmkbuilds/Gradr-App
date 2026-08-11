import { useAuth } from "@/hooks/useAuth";
import { Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

export function GuestBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Anonymous users have is_anonymous flag set to true
  const isGuest = user?.is_anonymous === true;

  if (!isGuest || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-7 w-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <p className="text-sm text-foreground truncate">
          You're browsing as a guest.{" "}
          <Link
            to="/auth?mode=signup"
            className="font-semibold text-primary hover:underline"
          >
            Create a free account
          </Link>{" "}

          <span className="text-muted-foreground">to save your data permanently.</span>
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
