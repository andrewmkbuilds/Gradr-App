import { useState, useEffect } from "react";
import { User, Save, Loader2 } from "lucide-react";
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

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user!.id)
      .single();

    if (data) {
      setDisplayName(data.display_name || "");
      setTargetJobTitle(data.target_job_title || "");
      setTargetSalary(data.target_salary || "");
      setTargetIndustry(data.target_industry || "");
      setCareerStage(data.career_stage || "");
      setSkills(data.skills?.join(", ") || "");
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        target_job_title: targetJobTitle || null,
        target_salary: targetSalary || null,
        target_industry: targetIndustry || null,
        career_stage: careerStage || null,
        skills: skills ? skills.split(",").map((s) => s.trim()).filter(Boolean) : null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile saved!");
    }
    setSaving(false);
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
