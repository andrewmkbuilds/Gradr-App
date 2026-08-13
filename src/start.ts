import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

/**
 * `/lovable/*` routes (email queue processing, webhook callbacks, preview) are
 * called by infrastructure, not browsers, and authenticate themselves. They
 * must skip app-level middleware entirely or those calls get redirected.
 */
const isInfraRequest = (url: string) => {
  const { pathname } = new URL(url);
  return pathname.startsWith("/lovable/") || pathname === "/email/unsubscribe";
};

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (isInfraRequest(request.url)) return next();
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
