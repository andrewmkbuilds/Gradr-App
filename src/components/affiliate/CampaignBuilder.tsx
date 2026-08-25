import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2, Link2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  affiliateProfileId: string;
  affiliateCode: string;
}

type FormState = {
  name: string;
  landing_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  notes: string;
};

const empty: FormState = {
  name: "",
  landing_path: "/",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_content: "",
  utm_term: "",
  notes: "",
};

function buildLink(code: string, s: Partial<FormState>) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const path = s.landing_path?.startsWith("/") ? s.landing_path : `/${s.landing_path || ""}`;
  const url = new URL(origin + (path || "/"));
  url.searchParams.set("ref", code);
  if (s.utm_source) url.searchParams.set("utm_source", s.utm_source);
  if (s.utm_medium) url.searchParams.set("utm_medium", s.utm_medium);
  if (s.utm_campaign) url.searchParams.set("utm_campaign", s.utm_campaign);
  if (s.utm_content) url.searchParams.set("utm_content", s.utm_content);
  if (s.utm_term) url.searchParams.set("utm_term", s.utm_term);
  return url.toString();
}

export function CampaignBuilder({ affiliateProfileId, affiliateCode }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  const preview = useMemo(() => buildLink(affiliateCode, form), [affiliateCode, form]);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["affiliateCampaigns", affiliateProfileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_campaigns")
        .select("*")
        .eq("affiliate_profile_id", affiliateProfileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Give your campaign a name");
      const payload = {
        affiliate_profile_id: affiliateProfileId,
        name: form.name.trim(),
        landing_path: form.landing_path || "/",
        utm_source: form.utm_source || null,
        utm_medium: form.utm_medium || null,
        utm_campaign: form.utm_campaign || null,
        utm_content: form.utm_content || null,
        utm_term: form.utm_term || null,
        notes: form.notes || null,
      };
      const { error } = await supabase.from("affiliate_campaigns").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign saved");
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["affiliateCampaigns", affiliateProfileId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("affiliate_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["affiliateCampaigns", affiliateProfileId] });
    },
  });

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "text-xs font-medium text-muted-foreground block mb-1.5";

  return (
    <div className="space-y-6">
      <div className="elev-2 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Campaign link builder</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Campaign name *</label>
            <input value={form.name} onChange={set("name")} placeholder="Twitter launch" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Landing path</label>
            <input value={form.landing_path} onChange={set("landing_path")} placeholder="/pricing" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>utm_source</label>
            <input value={form.utm_source} onChange={set("utm_source")} placeholder="twitter" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>utm_medium</label>
            <input value={form.utm_medium} onChange={set("utm_medium")} placeholder="social" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>utm_campaign</label>
            <input value={form.utm_campaign} onChange={set("utm_campaign")} placeholder="spring-launch" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>utm_content</label>
            <input value={form.utm_content} onChange={set("utm_content")} placeholder="hero-cta" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>utm_term (optional)</label>
            <input value={form.utm_term} onChange={set("utm_term")} placeholder="career+os" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Notes (private)</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} className={inputCls} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-3 flex items-center gap-2 flex-wrap">
          <Link2 className="h-4 w-4 text-primary shrink-0" />
          <code className="text-xs text-foreground break-all flex-1 min-w-0">{preview}</code>
          <button
            onClick={() => copy(preview)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-secondary text-xs hover:bg-secondary/80 transition"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 transition"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save campaign
        </button>
      </div>

      <div className="elev-2 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Saved campaigns</h3>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : !campaigns || campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No saved campaigns yet — build one above and hit save.
          </p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => {
              const url = buildLink(affiliateCode, {
                landing_path: c.landing_path,
                utm_source: c.utm_source ?? "",
                utm_medium: c.utm_medium ?? "",
                utm_campaign: c.utm_campaign ?? "",
                utm_content: c.utm_content ?? "",
                utm_term: c.utm_term ?? "",
              });
              return (
                <li key={c.id} className="p-3 rounded-lg bg-secondary/40 border border-border">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {[c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).join(" · ") || "no UTMs"} ·
                        {" "}created {format(new Date(c.created_at), "MMM d")}
                      </div>
                      <code className="text-[11px] text-muted-foreground break-all block mt-1">{url}</code>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => copy(url)}
                        aria-label="Copy campaign link"
                        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove.mutate(c.id)}
                        aria-label="Delete campaign"
                        className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
