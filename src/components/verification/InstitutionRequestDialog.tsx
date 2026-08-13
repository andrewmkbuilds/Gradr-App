import { useEffect, useState } from "react";
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
  /** Academic address the user already typed, used to pre-fill email + domain. */
  prefillEmail?: string;
}

/** "Request your institution to be added" — a real submission, reviewed by an admin. */
export function InstitutionRequestDialog({
  open,
  onOpenChange,
  category = null,
  prefillEmail = "",
}: Props) {
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

  useEffect(() => {
    if (!open) return;
    const email = prefillEmail.trim().toLowerCase();
    if (!email.includes("@")) return;
    setForm((f) => ({
      ...f,
      email: f.email || email,
      email_domain: f.email_domain || email.split("@")[1],
    }));
  }, [open, prefillEmail]);

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
      toast.success("Request received", {
        description: "A Gradr admin will review the domain and let you know once it's approved.",
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
          <DialogTitle>Request your school or university to be added</DialogTitle>
          <DialogDescription>
            Tell us about your school. A Gradr admin reviews every request; once the domain is approved, students there can verify instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
          <Field id="ir-name" label="Your full name" value={form.full_name} onChange={set("full_name")} required />
          <Field id="ir-inst" label="School / university name" value={form.name} onChange={set("name")} required />
          <Field
            id="ir-site"
            label="School / university website"
            value={form.website}
            onChange={set("website")}
            placeholder="https://university.edu"
          />
          <Field
            id="ir-domain"
            label="School / university email domain"
            value={form.email_domain}
            onChange={set("email_domain")}
            placeholder="university.edu"
            required
          />
          <Field
            id="ir-email"
            label="Your academic email address"
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
