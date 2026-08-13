import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { eligibilityIcon } from "@/config/eligibility";
import {
  REQUEST_STATUS_COPY,
  VERIFICATION_FORMS,
  isFreeMailDomain,
  looksInstitutional,
  verificationForm,
  type VerificationField,
} from "@/config/verificationForms";
import {
  uploadVerificationDocument,
  useMyVerificationRequests,
  useSubmitVerificationRequest,
} from "@/hooks/useVerificationRequests";
import { InstitutionRequestDialog } from "@/components/verification/InstitutionRequestDialog";
import { StudentEmailVerification } from "@/components/verification/StudentEmailVerification";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a category and skip the picker. */
  defaultType?: string | null;
}

type Values = Partial<Record<VerificationField["name"], string>>;

/**
 * Real eligibility verification.
 *
 * There is no third-party verification vendor: the form below is submitted to
 * Gradr's own review queue and the user is told, truthfully, that a human will
 * review it. Nothing is ever auto-approved from an email suffix.
 */
export function VerificationDialog({ open, onOpenChange, defaultType = null }: Props) {
  const { user } = useAuth();
  const { data: requests = [], refetch, isFetching } = useMyVerificationRequests();
  const submit = useSubmitVerificationRequest();

  const [selected, setSelected] = useState<string | null>(defaultType);
  const [values, setValues] = useState<Values>({});
  const [confirmed, setConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [institutionOpen, setInstitutionOpen] = useState(false);
  const [institutionEmail, setInstitutionEmail] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(defaultType);
      setValues({});
      setConfirmed(false);
      setFile(null);
      setSubmittedId(null);
    }
  }, [open, defaultType]);

  const form = selected ? verificationForm(selected) : undefined;
  const isEmailVerify = Boolean(form?.emailVerification);

  const latest = useMemo(
    () => (selected ? requests.find((r) => r.category === selected) : undefined),
    [requests, selected],
  );
  const submittedRequest = submittedId
    ? requests.find((r) => r.id === submittedId) ?? latest
    : undefined;

  const set = (name: VerificationField["name"], value: string) =>
    setValues((v) => ({ ...v, [name]: value }));

  const emailValue = values.email ?? "";
  const missing = form
    ? form.fields.filter(
        (f) => f.required && f.type !== "file" && !(values[f.name] ?? "").trim(),
      )
    : [];
  const canSubmit = Boolean(form) && confirmed && missing.length === 0 && !submit.isPending;

  const handleSubmit = async () => {
    if (!form || !user) return;
    if (!confirmed) {
      toast.error("Please confirm the declaration before submitting.");
      return;
    }
    if (missing.length) {
      toast.error(`Complete: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    try {
      let documentPath: string | null = null;
      if (file) documentPath = await uploadVerificationDocument(user.id, file);

      const id = await submit.mutateAsync({
        category: form.key,
        full_name: values.full_name ?? "",
        email: emailValue,
        organization: values.organization ?? null,
        website: values.website ?? null,
        personal_email: values.personal_email ?? null,
        country: values.country ?? null,
        role_or_status: values.role_or_status ?? null,
        supporting_information: values.supporting_information ?? null,
        document_path: documentPath,
      });
      setSubmittedId(id);
      await refetch();
      trackEvent("verification_request_submitted", { location: form.key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit your request.");
    }
  };

  const checkStatus = async () => {
    const { data } = await refetch();
    const row = data?.find((r) => (submittedId ? r.id === submittedId : r.category === selected));
    const copy = REQUEST_STATUS_COPY[row?.status ?? "pending"];
    toast.info(copy?.label ?? "Pending review", { description: copy?.hint });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              {form ? `Verify: ${form.label}` : "Get your discount"}
            </DialogTitle>
            <DialogDescription>
              {isEmailVerify
                ? "Confirm your school or university email address. We email you a one-time code — no student ID, documents or third parties involved."
                : form
                  ? "Fill in your details. A Gradr reviewer checks every request by hand — nothing is approved automatically."
                  : "Pick what describes you. Requests are reviewed by our team, usually within 1–2 business days."}
            </DialogDescription>

          </DialogHeader>

          {/* Step 1 — category picker */}
          {!form && (
            <div className="grid gap-2 py-1 max-h-[55vh] overflow-y-auto pr-1">
              {VERIFICATION_FORMS.map((c) => {
                const Icon = eligibilityIcon(c.key);
                const mine = requests.find((r) => r.category === c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelected(c.key)}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{c.label}</span>
                      <span className="block text-xs text-muted-foreground">{c.blurb}</span>
                    </span>
                    {mine ? (
                      <Badge variant="outline" className={REQUEST_STATUS_COPY[mine.status]?.tone}>
                        {REQUEST_STATUS_COPY[mine.status]?.label}
                      </Badge>
                    ) : c.discountPercent > 0 ? (
                      <Badge className="shrink-0">{c.discountPercent}% off</Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        Badge only
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Student — academic email ownership check */}
          {form && isEmailVerify && (
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              <StudentEmailVerification
                discountPercent={form.discountPercent}
                onRequestInstitution={(prefill) => {
                  setInstitutionEmail(prefill);
                  setInstitutionOpen(true);
                }}
              />
            </div>
          )}

          {/* Step 3 — real submitted state */}
          {form && !isEmailVerify && submittedRequest && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  Verification request submitted
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll review your information and notify you when a decision is made.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">Current status:</span>
                <Badge variant="outline" className={REQUEST_STATUS_COPY[submittedRequest.status]?.tone}>
                  {REQUEST_STATUS_COPY[submittedRequest.status]?.label}
                </Badge>
              </div>
              {submittedRequest.reviewer_notes && (
                <p className="text-xs text-muted-foreground">
                  Reviewer note: {submittedRequest.reviewer_notes}
                </p>
              )}
            </div>
          )}

          {/* Step 2 — category form */}
          {form && !isEmailVerify && !submittedRequest && (

            <div className="space-y-4 py-1 max-h-[60vh] overflow-y-auto pr-1">
              {latest && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Previous request: <strong>{REQUEST_STATUS_COPY[latest.status]?.label}</strong>
                  {latest.reviewer_notes ? ` — ${latest.reviewer_notes}` : ""}
                </div>
              )}

              {form.fields.map((field) => (
                <FieldControl
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? ""}
                  onChange={(v) => set(field.name, v)}
                  file={file}
                  onFile={setFile}
                />
              ))}

              {form.institutionRequest && (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="text-xs font-medium text-foreground">
                    Don't see your school email/domain supported?
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-xs"
                    onClick={() => setInstitutionOpen(true)}
                  >
                    Request your institution to be added
                  </Button>
                </div>
              )}

              {emailValue.includes("@") &&
                !looksInstitutional(emailValue) &&
                isFreeMailDomain(emailValue) &&
                form.key !== "military" && (
                  <p className="text-xs text-warning">
                    That looks like a personal mailbox. A work or school address speeds up review — a
                    reviewer may ask for more information otherwise.
                  </p>
                )}

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
                  What we store and why
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>{form.storageNote}</li>
                  <li>Only Gradr reviewers can see your request. It is never sold or shared.</li>
                  <li>Any document you upload is stored privately and deleted after review.</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 text-sm text-foreground">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  aria-label={form.confirmation}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed">{form.confirmation}</span>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {form && !defaultType && !submittedRequest ? (
              <Button variant="ghost" onClick={() => setSelected(null)} className="gap-1">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </Button>
            ) : (
              <span />
            )}

            {form && !isEmailVerify &&
              (submittedRequest ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={checkStatus} disabled={isFetching} className="gap-2">
                    {isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    )}
                    Check verification status
                  </Button>
                  <Button onClick={() => onOpenChange(false)}>Done</Button>
                </div>
              ) : (
                <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                  {submit.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  Submit for review
                </Button>
              ))}
            {form && isEmailVerify && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}

          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InstitutionRequestDialog
        open={institutionOpen}
        onOpenChange={setInstitutionOpen}
        category={selected}
        prefillEmail={institutionEmail}
      />
    </>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  file,
  onFile,
}: {
  field: VerificationField;
  value: string;
  onChange: (v: string) => void;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const id = `vf-${field.name}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>

      {field.type === "textarea" ? (
        <Textarea
          id={id}
          rows={3}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Select one" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "file" ? (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Upload className="h-3 w-3" aria-hidden="true" />
              {file.name}
            </span>
          )}
        </div>
      ) : (
        <Input
          id={id}
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  );
}
