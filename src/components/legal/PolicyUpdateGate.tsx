import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { usePendingLegalAcceptances } from "@/hooks/useLegalDocuments";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

const PATH: Record<string, string> = { terms: "/terms", privacy: "/privacy" };

/**
 * Blocks the app until the signed-in user explicitly re-accepts any published
 * policy version that was flagged as a material change.
 */
export function PolicyUpdateGate() {
  const { user } = useAuth();
  const { pending, accept } = usePendingLegalAcceptances(Boolean(user));
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const doc = pending[0];
  if (!user || !doc) return null;

  const handleAccept = async () => {
    setSaving(true);
    try {
      await accept(doc.document_id);
      setChecked(false);
      toast.success("Thanks — your acceptance has been recorded.");
    } catch {
      toast.error("We couldn't record your acceptance. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        className="max-w-lg [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <DialogTitle>
            We've updated our {doc.doc_type === "privacy" ? "Privacy Notice" : "Terms & Conditions"}
          </DialogTitle>
          <DialogDescription>
            Version {doc.version}, effective {doc.effective_date}. Please review and accept to continue
            using Gradr.
          </DialogDescription>
        </DialogHeader>

        {doc.summary_of_changes && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Summary of material changes</p>
            {doc.summary_of_changes}
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            aria-label="Accept the updated policy"
            className="mt-0.5"
          />
          <span>
            I have read and accept the updated{" "}
            <Link to={PATH[doc.doc_type] ?? "/privacy"} target="_blank" className="text-primary underline">
              {doc.title}
            </Link>
            .
          </span>
        </label>

        <Button onClick={handleAccept} disabled={!checked || saving} className="w-full">
          {saving ? "Saving…" : "Accept and continue"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
