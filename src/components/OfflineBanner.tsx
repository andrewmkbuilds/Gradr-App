import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloudOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";

/**
 * Slim connectivity strip. Appears while offline and confirms briefly on
 * reconnect, so the user always knows why the app stopped syncing.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const reduced = useReducedMotionPref();
  const [justReconnected, setJustReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setJustReconnected(false);
      return;
    }
    if (!wasOffline) return;
    setJustReconnected(true);
    const t = window.setTimeout(() => setJustReconnected(false), 3200);
    return () => window.clearTimeout(t);
  }, [online, wasOffline]);

  const visible = !online || justReconnected;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 sm:bottom-6"
        >
          <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur ${
              online
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-accent/40 bg-card/95 text-foreground"
            }`}
          >
            {online ? (
              <Wifi className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CloudOff className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            )}
            <span>
              {online
                ? "Back online — syncing your work."
                : "You're offline. Viewing saved pages; changes will sync when you reconnect."}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineBanner;
