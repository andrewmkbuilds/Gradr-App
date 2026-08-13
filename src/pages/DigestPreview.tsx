import { useEffect, useState } from "react";
import { Bell, Briefcase, Clock, Loader2, Mail, ShieldAlert, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const sampleJobs = [
  { title: "Senior Frontend Engineer", company: "Northstar AI", location: "Remote", matchScore: 94 },
  { title: "Product Engineer, Growth", company: "SignalStack", location: "New York, NY", matchScore: 89 },
  { title: "Full Stack TypeScript Developer", company: "HelioCloud", location: "Austin, TX", matchScore: 87 },
];

const sampleReminders = [
  { title: "Send recruiter follow-up", jobTitle: "Senior Frontend Engineer", company: "Northstar AI", due: "Yesterday" },
  { title: "Prep interview notes", jobTitle: "Product Engineer, Growth", company: "SignalStack", due: "2 days ago" },
];

export default function DigestPreview() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
      setChecking(false);
    };
    void checkAdmin();
  }, [user]);

  const prepareLivePreview = async () => {
    setPreviewing(true);
    const { data, error } = await supabase.functions.invoke("daily-digest", { body: { previewOnly: true } });
    setPreviewing(false);
    if (error || data?.error) {
      toast.error(data?.error || "Could not prepare digest preview");
      return;
    }
    toast.success(`Preview prepared: ${data.jobsCount} jobs, ${data.remindersCount} reminders`);
  };

  if (checking) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-6 border-destructive/40 bg-destructive/10">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Digest previews can include recipient-specific job and reminder data, so this page is restricted to admins.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Digest Email Preview</h1>
          <p className="text-sm text-muted-foreground mt-1">Sample template for high-match jobs and overdue reminders.</p>
        </div>
        <Button onClick={prepareLivePreview} disabled={previewing} className="gap-2">
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Prepare live preview
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">3 high-match jobs + 2 follow-ups due</span>
          </div>
          <Badge variant="secondary">Sample data</Badge>
        </div>

        <div className="bg-background p-6 sm:p-8">
          <div className="max-w-2xl mx-auto rounded-xl border border-border bg-card p-6 space-y-6 shadow-lg">
            <div>
              <p className="text-xs uppercase tracking-wide text-primary font-semibold">Gradr</p>
              <h2 className="text-2xl font-bold text-foreground mt-2">Your daily career digest</h2>
              <p className="text-sm text-muted-foreground mt-2">Fresh opportunities and follow-ups that need attention today.</p>
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">High-match jobs</h3>
              </div>
              {sampleJobs.map((job) => (
                <div key={job.title} className="rounded-lg border border-border bg-secondary/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{job.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{job.company} · {job.location}</p>
                    </div>
                    <Badge className="bg-primary/15 text-primary border-primary/30">{job.matchScore}%</Badge>
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-semibold text-foreground">Overdue reminders</h3>
              </div>
              {sampleReminders.map((reminder) => (
                <div key={reminder.title} className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <p className="text-sm font-semibold text-foreground">{reminder.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{reminder.jobTitle} · {reminder.company}</p>
                  <p className="text-xs text-warning mt-2 flex items-center gap-1"><Clock className="h-3 w-3" /> {reminder.due}</p>
                </div>
              ))}
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
