import { createFileRoute } from "@tanstack/react-router";
import OAuthConsent from "@/pages/OAuthConsent";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  head: () => ({
    meta: [
      { title: "Authorize an app | Gradr" },
      {
        name: "description",
        content:
          "Review and approve third-party access to your Gradr account. Signed-in Gradr users only.",
      },
      // Never index or follow: this page renders a third-party app name, so an
      // indexed copy could be mistaken for (or reported as) a deceptive page.
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "googlebot", content: "noindex, nofollow" },
    ],
  }),
  component: () => <OAuthConsent />,
});
