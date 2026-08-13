import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { logEmailEvent } from "@/lib/email/events.server";
import { EMAIL_SITE_URL, isSafeRedirectTarget } from "@/lib/email/tracking";

export const Route = createFileRoute("/api/public/email/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const messageId = url.searchParams.get("m");
        const target = url.searchParams.get("u") ?? "";
        const label = url.searchParams.get("l");

        const destination = isSafeRedirectTarget(target) ? target : EMAIL_SITE_URL;

        try {
          const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
          const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
          if (messageId && supabaseUrl && serviceKey) {
            const supabase = createClient(supabaseUrl, serviceKey);
            const { data: log } = await supabase
              .from("email_send_log")
              .select("template_name, recipient_email")
              .eq("message_id", messageId)
              .limit(1)
              .maybeSingle();

            await logEmailEvent(supabase, {
              messageId,
              templateName: log?.template_name ?? null,
              recipientEmail: log?.recipient_email ?? null,
              eventType: "clicked",
              url: destination,
              userAgent: request.headers.get("user-agent"),
              metadata: label ? { label } : {},
            });
          }
        } catch (error) {
          console.error("Email click tracking failed", error);
        }

        return new Response(null, {
          status: 302,
          headers: { Location: destination, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
