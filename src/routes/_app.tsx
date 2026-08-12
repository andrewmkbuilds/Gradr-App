import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoutes } from "@/components/ProtectedRoutes";

export const Route = createFileRoute("/_app")({
  component: () => <ProtectedRoutes />,
});
