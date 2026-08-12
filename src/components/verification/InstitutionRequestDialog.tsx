import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRequestInstitution } from "@/hooks/useVerificationRequests";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: string | null;
}

/** "Request your institution to be added" — a real submission, reviewed by an admin. */
export function InstitutionRequestDialog({ open, onOpenChange, category = null }: Props) {
  const request = useRequestInstitution();
  const [form, setForm] = useState({
    full_name: "",
    name: "",
    website: "",
    email_domain: "",
    email: "",
    country: "",
    notes: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.full_name.trim() || !form.name.trim() || !form.email_domain.trim()) {
      toast.error("Add your name, the institution and its email domain.");
      return;
    }
    try {
      await request.mutateAsync({
        name: form.name,
        email_domain: form.email_domain,
        website: form.website,
        country: form.country,
        category,
        notes: [
          `Requested by ${form.full_name.trim()}`,
          form.email.trim() ? `Institution email: ${form.email.trim()}` : null,
          form.notes.trim() || null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      toast.success("Institution request submitted", {
        description: "We'll review the domain and let you know when it's recognised.",
      });
      onOpenChange(false);
      setForm({ full_name: "", name: "", website: "", email_domain: "", email: "", country: "", notes: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit the request.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request your institution to be added</DialogTitle>
          <DialogDescription>
            Tell us about the institution and we'll add its domain to the recognised list after review.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
          <Field id="ir-name" label="Full name" value={form.full_name} onChange={set("full_name")} required />
          <Field id="ir-inst" label="Institution name" value={form.name} onChange={set("name")} required />
          <Field
            id="ir-site"
            label="Institution website"
            value={form.website}
            onChange={set("website")}
            placeholder="https://university.edu"
          />
          <Field
            id="ir-domain"
            label="Institution email domain"
            value={form.email_domain}
            onChange={set("email_domain")}
            placeholder="university.edu"
            required
          />
          <Field
            id="ir-email"
            label="Institution email address"
            value={form.email}
            onChange={set("email")}
            placeholder="you@university.edu"
            type="email"
          />
          <Field id="ir-country" label="Country" value={form.country} onChange={set("country")} />
          <div className="space-y-1.5">
            <Label htmlFor="ir-notes">Additional information (optional)</Label>
            <Textarea
              id="ir-notes"
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              rows={3}
              placeholder="Anything that helps us confirm this institution."
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={request.isPending} className="gap-2">
            {request.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
