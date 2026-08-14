import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { setAnalyticsPerson, setAnalyticsUserContext } from "@/lib/telemetry/events";

/**
 * Keeps plan and subscription state attached to every analytics event.
 *
 * Rendered once inside the auth + query providers: without it a `checkout_started`
 * event could not be broken down by the plan the user was on when they clicked.
 */
export function AnalyticsProvider() {
  const { user } = useAuth();
  const { plan, status, billingInterval, isSubscribed, isLoading } = useSubscription();

  useEffect(() => {
    if (isLoading) return;
    setAnalyticsUserContext({
      status: !user ? "anonymous" : user.is_anonymous ? "guest" : "authenticated",
      plan: user ? plan : undefined,
      subscriptionStatus: user ? status ?? (isSubscribed ? "active" : "free") : undefined,
    });
    if (user && !user.is_anonymous) {
      setAnalyticsPerson({
        plan,
        subscription_status: status ?? (isSubscribed ? "active" : "free"),
        billing_period: billingInterval ?? undefined,
        is_paying: isSubscribed,
      });
    }
  }, [user, plan, status, billingInterval, isSubscribed, isLoading]);

  return null;
}
