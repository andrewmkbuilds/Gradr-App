import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { logEmailEvent } from "@/lib/email/events.server";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.byteLength),
    },
  });
}

export const Route = createFileRoute("/api/public/email/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const messageId = new URL(request.url).searchParams.get("m");
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
              eventType: "opened",
              userAgent: request.headers.get("user-agent"),
            });
          }
        } catch (error) {
          console.error("Email open tracking failed", error);
        }
        // Always return the pixel — tracking must never break rendering.
        return pixelResponse();
      },
    },
  },
});
