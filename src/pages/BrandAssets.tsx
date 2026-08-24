import { useMemo, useState } from "react";
import JSZip from "jszip";
import { Download, Image as ImageIcon, Loader2, Smartphone } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { BRAND_ASSETS, type BrandAsset, type BrandAssetGroup } from "@/config/brandAssets.generated";

/** Human labels + ordering for the asset groups. */
const GROUPS: { id: BrandAssetGroup; title: string; blurb: string }[] = [
  {
    id: "favicon",
    title: "Favicons & web icons",
    blurb: "Browser tabs, bookmarks, desktop installs and Android launchers.",
  },
  {
    id: "apple",
    title: "Apple touch icons",
    blurb: "iOS composites home-screen icons on an opaque plate, so these ship on Deep Sea.",
  },
  {
    id: "maskable",
    title: "Maskable icons",
    blurb: "Android crops these to a circle or squircle — the mark sits inside the 80% safe zone.",
  },
  { id: "splash", title: "iOS launch screens", blurb: "Shown while an installed Gradr boots on iPhone and iPad." },
  { id: "logo", title: "Logo lockups", blurb: "The master artwork every icon above is rendered from." },
  { id: "social", title: "Social preview cards", blurb: "Open Graph and Twitter cards for shared links." },
];

const formatBytes = (bytes: number) =>
  bytes === 0 ? "—" : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 102400 ? 1 : 0)} KB`;

const dimensions = (asset: BrandAsset) =>
  asset.width === 0 ? "vector" : `${asset.width}×${asset.height}`;

function downloadUrl(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function AssetTile({ asset }: { asset: BrandAsset }) {
  const filename = asset.file.split("/").pop() ?? asset.file;
  const isSplash = asset.group === "splash";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-4">
      <div
        className={`flex items-center justify-center overflow-hidden rounded-lg bg-surface-secondary bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%),linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] ${
          isSplash ? "h-40" : "h-28"
        }`}
      >
        <img
          src={asset.file}
          alt={`${asset.label} — ${dimensions(asset)}`}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
          style={
            asset.group === "favicon" && asset.width > 0 && asset.width <= 64
              ? { width: asset.width, height: asset.height, imageRendering: "pixelated" }
              : undefined
          }
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <code className="truncate text-xs font-medium text-foreground">{filename}</code>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {dimensions(asset)}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{asset.label}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{formatBytes(asset.bytes)}</p>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-auto min-h-11 w-full"
        onClick={() => downloadUrl(asset.file, filename)}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        Download
      </Button>
    </div>
  );
}

export default function BrandAssets() {
  const [zipping, setZipping] = useState(false);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        assets: BRAND_ASSETS.filter((a) => a.group === group.id),
      })).filter((g) => g.assets.length > 0),
    [],
  );

  const totalBytes = BRAND_ASSETS.reduce((sum, a) => sum + a.bytes, 0);

  async function downloadAll() {
    setZipping(true);
    try {
      const zip = new JSZip();
      const results = await Promise.all(
        BRAND_ASSETS.map(async (asset) => {
          const res = await fetch(asset.file);
          if (!res.ok) throw new Error(`${asset.file} (${res.status})`);
          return { path: asset.file.replace(/^\//, ""), blob: await res.blob() };
        }),
      );
      for (const { path, blob } of results) zip.file(path, blob);
      zip.file(
        "README.txt",
        [
          "Gradr brand assets",
          "",
          "Every icon is rendered from public/gradr-logo.png by",
          "scripts/generate-app-icons.mjs. Regenerate with: npm run icons:generate",
          "",
          ...BRAND_ASSETS.map((a) => `${a.file}  ${dimensions(a)}  — ${a.label}`),
        ].join("\n"),
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      downloadUrl(url, "gradr-brand-assets.zip");
      URL.revokeObjectURL(url);
      toast({ title: "Asset pack downloaded", description: `${BRAND_ASSETS.length} files zipped.` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not build the asset pack",
        description: err instanceof Error ? err.message : "Unexpected error.",
      });
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <PageHeader
        eyebrow="Brand"
        title="Icons & logo assets"
        description="Every generated Gradr icon, launch screen and social card, previewed at its real size. Download one file or the whole set."
        icon={<ImageIcon className="h-5 w-5" aria-hidden="true" />}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{BRAND_ASSETS.length} assets</Badge>
            <Badge variant="secondary">{formatBytes(totalBytes)} total</Badge>
            <Badge variant="secondary">Master: /gradr-logo.png</Badge>
          </div>
        }
        actions={
          <Button onClick={downloadAll} disabled={zipping} className="min-h-11">
            {zipping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {zipping ? "Packaging…" : "Download full set (.zip)"}
          </Button>
        }
      />

      <div className="space-y-10">
        {grouped.map((group) => (
          <section key={group.id} className="space-y-4">
            <div>
              <h2 className="font-display text-xl tracking-tight text-foreground">{group.title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{group.blurb}</p>
            </div>
            <div
              className={`grid gap-4 ${
                group.id === "splash" || group.id === "social"
                  ? "grid-cols-2 md:grid-cols-4"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              }`}
            >
              {group.assets.map((asset) => (
                <AssetTile key={asset.file} asset={asset} />
              ))}
            </div>
          </section>
        ))}

        <Card tone="insight">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
              How these are wired up
            </CardTitle>
            <CardDescription>
              Regenerating the set keeps the manifest, head tags and this page in sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="text-foreground">Favicons</span> are linked at 16/32/64 px in{" "}
              <code>index.html</code>; browsers pick the closest match per surface.
            </p>
            <p>
              <span className="text-foreground">Apple touch icons</span> ship at 120/152/167/180 px on an opaque
              background, with launch screens declared per device viewport.
            </p>
            <p>
              <span className="text-foreground">Android</span> reads <code>/site.webmanifest</code>, which lists every
              size plus dedicated maskable variants.
            </p>
            <p>
              Run <code>npm run icons:generate</code> after any logo change, then{" "}
              <code>npm run icons:check</code> in CI to catch a missing size.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
