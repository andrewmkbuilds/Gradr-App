import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { urlFor } from "@/config/domains";
import { useNavigate } from "react-router-dom";
import { identifyUser, setSessionContext } from "@/lib/telemetry/journey";
import { setAnalyticsUserContext } from "@/lib/telemetry/events";
import { completeSignupTracking, resetSignupTracking } from "@/lib/telemetry/signup";


interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
        // Analytics only — never block or await inside the auth callback.
        if (event === "SIGNED_OUT") {
          resetSignupTracking();
          return;
        }
        if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
          queueMicrotask(() => completeSignupTracking(session.user));
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const user = session?.user ?? null;
    // Identity is the Gradr user id, so the anonymous pre-signup journey and
    // every later paid event belong to one person in PostHog.
    identifyUser(user?.id ?? null);
    setAnalyticsUserContext({
      status: !user ? "anonymous" : user.is_anonymous ? "guest" : "authenticated",
    });
    setSessionContext(session?.user?.id ? session.access_token.slice(-8) : null);
  }, [session?.user?.id, session?.user?.is_anonymous]);


  const signOut = async () => {
    await supabase.auth.signOut();
    // Signing out always lands on the public site root, never on an
    // authenticated route (and never on a product route of the marketing host).
    if (typeof window !== "undefined") {
      window.location.assign(urlFor("home", "/"));
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
