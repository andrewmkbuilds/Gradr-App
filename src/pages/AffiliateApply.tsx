import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { z } from "zod";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  brand_name: z.string().trim().max(120).optional().or(z.literal("")),
  website: z.string().trim().max(500).optional().or(z.literal("")),
  twitter: z.string().trim().max(200).optional().or(z.literal("")),
  linkedin: z.string().trim().max(200).optional().or(z.literal("")),
  youtube: z.string().trim().max(200).optional().or(z.literal("")),
  audience_type: z.string().trim().min(2).max(120),
  audience_size: z.string().trim().min(1).max(60),
  promotion_plan: z.string().trim().min(20).max(2000),
  why_join: z.string().trim().min(20).max(2000),
  payout_email: z.string().trim().email().max(255),
  payout_method: z.string().trim().max(60),
  agreed_to_terms: z.boolean().refine((v) => v === true, "You must agree to the terms"),
});

export default function AffiliateApply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: my, isLoading } = useMyAffiliate();
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (my?.profile?.status === "active") {
    navigate("/affiliate/dashboard", { replace: true });
    return null;
  }
  if (my?.application?.status === "pending") {
    return (
      <div className="max-w-2xl mx-auto glass-card p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground mb-2">Application under review</h1>
        <p className="text-sm text-muted-foreground">We typically review within 48 hours. We'll notify you once a decision is made.</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    const parsed = schema.safeParse({ ...raw, agreed_to_terms: fd.get("agreed_to_terms") === "on" });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please complete the form");
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    const { error } = await supabase.from("affiliate_applications").insert({
      user_id: user!.id,
      full_name: v.full_name,
      email: v.email,
      brand_name: v.brand_name || null,
      website: v.website || null,
      social_links: { twitter: v.twitter, linkedin: v.linkedin, youtube: v.youtube },
      audience_type: v.audience_type,
      audience_size: v.audience_size,
      promotion_plan: v.promotion_plan,
      why_join: v.why_join,
      payout_details: { email: v.payout_email, method: v.payout_method },
      agreed_to_terms: true,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Application submitted!");
    qc.invalidateQueries({ queryKey: ["myAffiliate"] });
    navigate("/affiliate");
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40";
  const labelCls = "text-xs font-medium text-foreground block mb-1.5";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Affiliate Application</h1>
        <p className="text-sm text-muted-foreground mt-1">Tell us about you and your audience.</p>
      </div>

      <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className={labelCls}>Full name *</label><input name="full_name" required defaultValue={user?.user_metadata?.full_name || ""} className={inputCls} /></div>
          <div><label className={labelCls}>Contact email *</label><input name="email" type="email" required defaultValue={user?.email || ""} className={inputCls} /></div>
          <div><label className={labelCls}>Brand / company</label><input name="brand_name" className={inputCls} /></div>
          <div><label className={labelCls}>Website</label><input name="website" placeholder="https://" className={inputCls} /></div>
          <div><label className={labelCls}>Twitter / X</label><input name="twitter" placeholder="@handle or url" className={inputCls} /></div>
          <div><label className={labelCls}>LinkedIn</label><input name="linkedin" className={inputCls} /></div>
          <div><label className={labelCls}>YouTube / TikTok</label><input name="youtube" className={inputCls} /></div>
          <div><label className={labelCls}>Audience type *</label><input name="audience_type" required placeholder="e.g. career coach, student creator" className={inputCls} /></div>
          <div><label className={labelCls}>Audience size *</label><input name="audience_size" required placeholder="e.g. 12k newsletter, 50k YT" className={inputCls} /></div>
          <div><label className={labelCls}>Payout email *</label><input name="payout_email" type="email" required defaultValue={user?.email || ""} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Payout method *</label>
            <select name="payout_method" defaultValue="paypal" className={inputCls}>
              <option value="paypal">PayPal</option>
              <option value="wise">Wise</option>
              <option value="bank">Bank transfer</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>How will you promote Gradr? *</label>
          <textarea name="promotion_plan" required rows={4} className={inputCls} placeholder="Newsletter feature, YouTube review, course bonus, etc." />
        </div>
        <div>
          <label className={labelCls}>Why do you want to join? *</label>
          <textarea name="why_join" required rows={3} className={inputCls} />
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="agreed_to_terms" required className="mt-1" />
          <span>I agree to the Gradr affiliate terms, including no self-referrals, no brand-keyword paid search, and commission reversal on refunds.</span>
        </label>
        <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit application
        </button>
      </form>
    </div>
  );
}
