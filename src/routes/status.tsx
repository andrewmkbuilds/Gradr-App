import { createFileRoute } from "@tanstack/react-router";
import StatusPage from "@/pages/StatusPage";
import { PublicShell } from "@/components/PublicShell";

// Title/description/OG live in RouteSeo's META map so metadata stays unique
// and defined in exactly one place.
export const Route = createFileRoute("/status")({
  component: () => (
    <PublicShell source="status">
      <StatusPage />
    </PublicShell>
  ),
});
