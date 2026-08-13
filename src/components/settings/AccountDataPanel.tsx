import { useState } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { Download, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";

/** Tables exported in the personal data archive. */
const EXPORT_TABLES = [
  "profiles",
  "user_preferences",
  "resumes",
  "job_matches",
  "tracked_jobs",
  "job_reminders",
  "interview_sessions",
  "notifications",
  "purchases",
  "subscribers",
  "usage_credits",
  "feature_usage",
  "user_integrations",
] as const;

export function AccountDataPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");

  const exportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const archive: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at },
      };

      for (const table of EXPORT_TABLES) {
        const { data, error } = await (supabase as any).from(table).select("*").eq("user_id", user.id);
        archive[table] = error ? { error: error.message } : data ?? [];
      }

      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gradr-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data export has been downloaded.");
    } catch {
      toast.error("Couldn't build your export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (confirm !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await invokeFunction("delete-account", {
        body: { confirm: "DELETE" },
      });
      if (error) throw error;
      if (!(data as { deleted?: boolean })?.deleted) throw new Error("not deleted");
      await supabase.auth.signOut();
      toast.success("Your account and data have been permanently deleted.");
      navigate("/", { replace: true });
    } catch {
      toast.error("Couldn't delete your account. Please try again or contact support.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="glass-card p-6 space-y-6" aria-label="Your data">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 extrude rounded-lg bg-primary/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-foreground">Your data</h2>
          <p className="text-xs text-muted-foreground">Export everything, or permanently close your account</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-secondary/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Export my data</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Profile, resumes, matches, applications, interviews and billing history as JSON.
          </p>
        </div>
        <Button onClick={exportData} disabled={exporting} variant="outline" className="gap-2 shrink-0">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download export
        </Button>
      </div>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Delete my account</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This permanently removes your account, files and every record above. It cannot be undone — export first if
            you want a copy.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            aria-label="Type DELETE to confirm account deletion"
            className="bg-background border-border sm:max-w-xs"
          />
          <Button
            onClick={deleteAccount}
            disabled={deleting || confirm !== "DELETE"}
            variant="destructive"
            className="gap-2 shrink-0"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete account
          </Button>
        </div>
      </div>
    </section>
  );
}
