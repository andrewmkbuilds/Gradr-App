import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import {
  uploadVerificationDocument,
  useSubmitVerificationAppeal,
} from "@/hooks/useVerificationRequests";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";

/**
 * Appeal a rejected verification with extra evidence. The request goes back to
 * the review queue and every step is written to the request's audit trail.
 */
export function AppealForm({
  requestId,
  onSubmitted,
}: {
  requestId: string;
  onSubmitted?: () => void;
}) {
  const { user } = useAuth();
  const appeal = useSubmitVerificationAppeal();
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    if (!user) return;
    if (message.trim().length < 20) {
      toast.error("Add at least a sentence or two of extra evidence.");
      return;
    }
    try {
      let documentPath: string | null = null;
      if (file) documentPath = await uploadVerificationDocument(user.id, file);
      await appeal.mutateAsync({ requestId, message: message.trim(), documentPath });
      trackEvent("verification_appeal_submitted", { location: "verification_dialog" });
      toast.success("Appeal submitted", {
        description: "A reviewer will look at your new evidence.",
      });
      setMessage("");
      setFile(null);
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit your appeal.");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Appeal this decision</p>
        <p className="text-xs text-muted-foreground">
          Tell us what we missed and attach any proof — a staff page, enrolment letter or ID.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appeal-message">Extra evidence</Label>
        <Textarea
          id="appeal-message"
          rows={4}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="For example: my faculty page is live at… / my enrolment runs until…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appeal-file">Supporting document (optional, max 5 MB)</Label>
        <Input
          id="appeal-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <Button onClick={submit} disabled={appeal.isPending} className="gap-2">
        {appeal.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        )}
        Submit appeal
      </Button>
    </div>
  );
}
