import { useEffect } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";

/** Post-checkout landing page. Paddle redirects here on success. */
export default function Welcome() {
  const [params] = useSearchParams();
  const isPack = params.get("purchase") === "pack";
  const queryClient = useQueryClient();

  // The webhook writes entitlements a moment after redirect — poll briefly.
  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["usage-credits"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    };
    invalidate();
    const timers = [2000, 5000, 10000].map((ms) => window.setTimeout(invalidate, ms));
    return () => timers.forEach(window.clearTimeout);
  }, [queryClient]);

  return (
    <div className="max-w-2xl mx-auto py-16">
      <Seo
        title="Welcome to Gradr"
        description="Your purchase is confirmed — start using your new AI career tools."
        path="/welcome"
      />
      <Card className="p-10 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isPack ? "Credits added" : "You're all set"}
          </h1>
          <p className="text-muted-foreground">
            {isPack
              ? "Your credit pack is being applied to your account — it appears in your usage within a few seconds."
              : "Your subscription is active. Entitlements unlock as soon as the payment confirmation lands (usually instantly)."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link to="/">
              Go to dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/billing">View billing</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
