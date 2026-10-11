import { useEffect } from "react";
import { LegalPage } from "@/components/legal/LegalPage";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { CookiePreferencesButton } from "@/components/CookieConsent";
import { COOKIE_POLICY_EFFECTIVE, COOKIE_POLICY_V1 } from "@/content/legalExtra";
import { SELLER_LEGAL_NAME } from "@/content/legal";

const KOOKIOK_DECLARATION_URL =
  "https://cdn.kookiok.com/declaration.js?id=01a129a3-1dce-7f13-82d8-77496a188dfc";

export default function CookiePolicy() {
  useEffect(() => {
    const container = document.getElementById("cookie-declaration");
    if (!container) return;

    // Avoid adding the declaration loader more than once during route remounts.
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.kookiok.com/declaration.js?id=01a129a3-1dce-7f13-82d8-77496a188dfc"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = KOOKIOK_DECLARATION_URL;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      container.replaceChildren();
    };
  }, []);

  return (
    <LegalPage
      title="Cookie Policy"
      intro={`Which cookies and similar technologies ${SELLER_LEGAL_NAME} uses on Gradr, why, and how to change your choices.`}
      lastUpdated={COOKIE_POLICY_EFFECTIVE}
    >
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="mb-3 text-sm text-foreground">
          Change what you allow at any time — your choice is saved on this device for 12 months.
        </p>
        <CookiePreferencesButton />
      </div>
      <PolicyDocument body={COOKIE_POLICY_V1} meta={`Effective ${COOKIE_POLICY_EFFECTIVE}`} />
      <section className="mt-8" aria-labelledby="cookie-declaration-heading">
        <h2 id="cookie-declaration-heading" className="mb-3 text-xl font-semibold">
          Current Cookie Declaration
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          This table is generated and updated by KookiOk.
        </p>
        <div id="cookie-declaration" />
      </section>
    </LegalPage>
  );
}
