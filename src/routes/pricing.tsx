import { createFileRoute } from "@tanstack/react-router";
import Pricing from "@/pages/Pricing";
import { AnimatedPage } from "@/components/AnimatedPage";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PublicShell } from "@/components/PublicShell";
import { useAuth } from "@/hooks/useAuth";

/** Pricing is publicly indexable: guests get the public shell, members the app chrome. */
function PricingRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return (
      <DashboardLayout>
        <AnimatedPage>
          <Pricing />
        </AnimatedPage>
      </DashboardLayout>
    );
  }
  return (
    <PublicShell source="pricing">
      <Pricing />
    </PublicShell>
  );
}

export const Route = createFileRoute("/pricing")({
  component: () => <PricingRoute />,
});
