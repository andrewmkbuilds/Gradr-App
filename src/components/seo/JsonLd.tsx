import { Helmet } from "react-helmet-async";
import type { JsonLd as JsonLdNode } from "@/lib/structuredData";
import { validateJsonLd } from "@/lib/structuredData";

interface JsonLdProps {
  nodes: JsonLdNode[];
  /** Label used in the dev-only validation warning. */
  label?: string;
}

/**
 * Renders JSON-LD blocks into <head>. In development, invalid schema is
 * reported in the console instead of silently shipping broken rich results.
 */
export function JsonLd({ nodes, label = "page" }: JsonLdProps) {
  if (import.meta.env.DEV) {
    const errors = nodes.flatMap((node, i) => validateJsonLd(node, `${label}[${i}]`));
    if (errors.length) {
      // eslint-disable-next-line no-console
      console.warn("[json-ld] invalid structured data:\n" + errors.join("\n"));
    }
  }

  return (
    <Helmet>
      {nodes.map((node, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(node)}
        </script>
      ))}
    </Helmet>
  );
}
