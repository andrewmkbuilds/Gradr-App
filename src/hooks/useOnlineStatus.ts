import { useEffect, useState } from "react";

/** Live browser connectivity flag. Defaults to online when unavailable. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
