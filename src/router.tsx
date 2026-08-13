import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { reportPermissionDenied } from "@/lib/security/permissionDenied";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      // Any RLS/grant regression that reaches a visitor is reported once so the
      // admin alert dashboard can flag permission-denied spikes immediately.
      onError: (error) => {
        if (typeof window === "undefined") return;
        const authenticated = Object.keys(window.localStorage ?? {}).some(
          (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
        );
        reportPermissionDenied(error, authenticated);
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
