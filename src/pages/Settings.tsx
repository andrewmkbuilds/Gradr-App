import { useState, useEffect } from "react";
import { User, Save, Loader2, Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [targetJobTitle, setTargetJobTitle] = useState("");
  const [targetSalary, setTargetSalary] = useState("");
  const [targetIndustry, setTargetIndustry] = useState("");
  const [careerStage, setCareerStage] = useState("");
  const [skills, setSkills] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestSendTime, setDigestSendTime] = useState("08:00");
  const [digestTimezone, setDigestTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [testingDigest, setTestingDigest] = useState(false);
  const [lastDigestStatus, setLastDigestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (data) {
      setDisplayName(data.display_name || "");
      setTargetJobTitle(data.target_job_title || "");
      setTargetSalary(data.target_salary || "");
      setTargetIndustry(data.target_industry || "");
      setCareerStage(data.career_stage || "");
      setSkills(data.skills?.join(", ") || "");
    }

    const { data: prefs } = await (supabase as any)
      .from("user_preferences")
      .select("digest_enabled, digest_send_time, digest_timezone")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (prefs) {
      setDigestEnabled(prefs.digest_enabled ?? true);
      setDigestSendTime(String(prefs.digest_send_time || "08:00").slice(0, 5));
      setDigestTimezone(prefs.digest_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
    }

    const { data: lastLog } = await (supabase as any)
      .from("digest_send_logs")
      .select("status, sent_at, jobs_count, reminders_count, error_message")
      .eq("user_id", user!.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLog) {
      setLastDigestStatus(`${lastLog.status} · ${lastLog.jobs_count} jobs · ${lastLog.reminders_count} reminders`);
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        display_name: displayName || null,
        target_job_title: targetJobTitle || null,
        target_salary: targetSalary || null,
        target_industry: targetIndustry || null,
        career_stage: careerStage || null,
        skills: skills ? skills.split(",").map((s) => s.trim()).filter(Boolean) : null,
      }, { onConflict: "user_id" });

    const { error: prefError } = await (supabase as any)
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        digest_enabled: digestEnabled,
        digest_send_time: digestSendTime,
        digest_timezone: digestTimezone || "America/New_York",
      }, { onConflict: "user_id" });

    if (error || prefError) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile saved!");
    }
    setSaving(false);
  };

  const sendTestDigest = async () => {
    if (!user) return;
    setTestingDigest(true);
    const { data, error } = await supabase.functions.invoke("daily-digest", { body: { test: true } });
    setTestingDigest(false);
    if (error || data?.error) {
      toast.error(data?.error || "Failed to prepare test digest");
      setLastDigestStatus("failed");
      return;
    }
    const status = `${data.status} · ${data.jobsCount} jobs · ${data.remindersCount} reminders`;
    setLastDigestStatus(status);
    toast.success("Test digest prepared");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Set your career preferences to improve AI recommendations</p>
      </div>

      <div className="glass-card p-6 space-y-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Account email</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Display Name</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="bg-secondary border-border" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Job Title</label>
            <Input value={targetJobTitle} onChange={(e) => setTargetJobTitle(e.target.value)} placeholder="e.g., Senior Frontend Engineer" className="bg-secondary border-border" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Salary</label>
              <Input value={targetSalary} onChange={(e) => setTargetSalary(e.target.value)} placeholder="e.g., $150k-$200k" className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Industry</label>
              <Input value={targetIndustry} onChange={(e) => setTargetIndustry(e.target.value)} placeholder="e.g., Fintech, SaaS" className="bg-secondary border-border" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Career Stage</label>
            <Input value={careerStage} onChange={(e) => setCareerStage(e.target.value)} placeholder="e.g., mid-career, senior, entry-level" className="bg-secondary border-border" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Skills (comma-separated)</label>
            <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g., React, TypeScript, Node.js, AWS" className="bg-secondary border-border" />
          </div>
        </div>

        <Button onClick={saveProfile} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Profile
        </Button>
      </div>
    </div>
  );
}
