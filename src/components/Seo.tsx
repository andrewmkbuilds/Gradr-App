import { Helmet } from "react-helmet-async";

interface SeoProps {
  title: string;
  description: string;
  path: string;
  /** Adds a robots noindex directive for utility pages. */
  noindex?: boolean;
}

const SITE = "Gradr";
const ORIGIN = "https://gradr.me";

export function Seo({ title, description, path, noindex }: SeoProps) {
  const fullTitle = `${title} — ${SITE}`;
  const url = `${ORIGIN}${path}`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
      <link rel="canonical" href={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
