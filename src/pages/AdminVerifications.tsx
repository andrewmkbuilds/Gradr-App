import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useAdminVerificationRequests,
  useAdminVerificationTimeline,
  useDeleteInstitution,
  useInstitutions,
  useReviewVerificationRequest,
  useSaveInstitution,
  verificationDocumentUrl,
  type AdminVerificationRequest,
} from "@/hooks/useAdminVerifications";
import { REQUEST_STATUS_COPY, VERIFICATION_FORMS } from "@/config/verificationForms";
import { PageHeader } from "@/components/app/PageHeader";
import { VerificationTimeline } from "@/components/verification/VerificationTimeline";

const QUEUES = [
  { id: "pending", label: "Pending" },
  { id: "needs_more_information", label: "Needs info" },
  { id: "appealed", label: "Appeals" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
] as const;

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function AdminVerifications() {
  const [queue, setQueue] = useState<string>("pending");
  const statusFilter = queue === "all" ? null : queue;
  const { data: requests = [], isLoading } = useAdminVerificationRequests(statusFilter);
  const [open, setOpen] = useState<AdminVerificationRequest | null>(null);

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Verification review"
        description="Approve, reject or ask for more information. Approving grants the discount immediately."
      />

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="institutions">Institution domains</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            {QUEUES.map((q) => (
              <Button
                key={q.id}
                size="sm"
                variant={queue === q.id ? "default" : "outline"}
                onClick={() => setQueue(q.id)}
              >
                {q.label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nothing in this queue.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setOpen(r)}
                    className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:border-primary/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {r.full_name} · {r.category_label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.email}
                        {r.organization ? ` · ${r.organization}` : ""} · {formatDate(r.submitted_at)}
                      </span>
                    </span>
                    {r.fraud_score >= 40 && (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                        <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Risk {r.fraud_score}
                      </Badge>
                    )}
                    {r.appeal_count > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <MessageSquare className="h-3 w-3" aria-hidden="true" /> Appeal
                      </Badge>
                    )}
                    {r.domain_proof_verified && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Domain proven
                      </Badge>
                    )}
                    {r.domain_matched && (
                      <Badge variant="secondary" className="gap-1">
                        <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Domain match
                      </Badge>
                    )}
                    <Badge variant="outline" className={REQUEST_STATUS_COPY[r.status]?.tone}>
                      {REQUEST_STATUS_COPY[r.status]?.label}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="institutions" className="pt-4">
          <InstitutionsPanel />
        </TabsContent>
      </Tabs>

      <ReviewDialog request={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ReviewDialog({
  request,
  onClose,
}: {
  request: AdminVerificationRequest | null;
  onClose: () => void;
}) {
  const review = useReviewVerificationRequest();
  const [notes, setNotes] = useState("");
  const [percent, setPercent] = useState<string>("");
  const [docUrl, setDocUrl] = useState<string | null>(null);

  const decide = async (decision: "approved" | "rejected" | "needs_more_information") => {
    if (!request) return;
    try {
      await review.mutateAsync({
        requestId: request.id,
        decision,
        notes: notes.trim() || null,
        discountPercentage: percent.trim() ? Number(percent) : null,
      });
      toast.success(
        decision === "approved"
          ? "Approved — discount applied to the account"
          : decision === "rejected"
            ? "Request rejected"
            : "More information requested",
      );
      setNotes("");
      setPercent("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record the decision.");
    }
  };

  const openDoc = async () => {
    if (!request?.document_path) return;
    const url = await verificationDocumentUrl(request.document_path);
    if (!url) {
      toast.error("Couldn't open the document.");
      return;
    }
    setDocUrl(url);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{request.category_label} verification</DialogTitle>
              <DialogDescription>
                Submitted {formatDate(request.submitted_at)}
                {request.reviewer_name ? ` · last reviewed by ${request.reviewer_name}` : ""}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid gap-2 py-1 text-sm max-h-[45vh] overflow-y-auto pr-1">
              <Row label="Full name" value={request.full_name} />
              <Row label="Account" value={request.applicant_name ?? request.user_id} />
              <Row label="Organization" value={request.organization} />
              <Row label="Website" value={request.website} link />
              <Row label="Email" value={request.email} />
              <Row label="Personal email" value={request.personal_email} />
              <Row label="Country" value={request.country} />
              <Row label="Role / status" value={request.role_or_status} />
              <Row label="Supporting info" value={request.supporting_information} />
              <Row label="Domain match" value={request.domain_matched ? "Yes" : "No"} />
              <Row
                label="Domain ownership proven"
                value={request.domain_proof_verified ? "Yes — one-time code confirmed" : "No"}
              />
              <Row label="Default discount" value={`${Number(request.discount_percentage)}%`} />
              {request.document_path && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Document</dt>
                  <dd>
                    <Button size="sm" variant="outline" className="gap-1" onClick={openDoc}>
                      Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </dd>
                </div>
              )}
            </dl>

            <FraudPanel request={request} />

            {request.latest_appeal && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Latest appeal ({request.appeal_count})
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {request.latest_appeal}
                </p>
              </div>
            )}

            <AuditTrail requestId={request.id} />

            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rv-percent">Discount to apply (%)</Label>
                <Input
                  id="rv-percent"
                  type="number"
                  min={0}
                  max={100}
                  value={percent}
                  placeholder={String(Number(request.discount_percentage))}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rv-notes">Reviewer notes (shared with the user)</Label>
                <Textarea
                  id="rv-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why this was approved, rejected, or what's still needed."
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                disabled={review.isPending}
                onClick={() => decide("needs_more_information")}
              >
                Request more info
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={review.isPending}
                  onClick={() => decide("rejected")}
                >
                  Reject
                </Button>
                <Button disabled={review.isPending} onClick={() => decide("approved")} className="gap-2">
                  {review.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Approve
                </Button>
              </div>
            </DialogFooter>
            {docUrl && (
              <p className="text-xs text-muted-foreground">
                Document link expires in 5 minutes.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FraudPanel({ request }: { request: AdminVerificationRequest }) {
  const flags = request.fraud_flags ?? [];
  const tone =
    request.fraud_score >= 40
      ? "border-destructive/40 bg-destructive/5"
      : request.fraud_score > 0
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-muted/20";

  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Automatic fraud checks · risk {request.fraud_score}/100
      </p>
      {flags.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No signals recorded.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {flags.map((f) => (
            <li key={f.code} className="flex items-start gap-2 text-xs">
              <Badge
                variant="outline"
                className={
                  f.severity === "high"
                    ? "border-destructive/40 text-destructive"
                    : f.severity === "medium"
                      ? "border-warning/40 text-warning"
                      : "border-border text-muted-foreground"
                }
              >
                {f.severity}
              </Badge>
              <span className="text-muted-foreground">{f.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AuditTrail({ requestId }: { requestId: string }) {
  const { data: events = [], isLoading } = useAdminVerificationTimeline(requestId);
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Admin audit trail
      </p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        <VerificationTimeline entries={events} emptyLabel="No actions recorded yet." />
      )}
    </div>
  );
}

function Row({ label, value, link }: { label: string; value?: string | null; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-foreground">
        {link ? (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function InstitutionsPanel() {
  const { data: institutions = [], isLoading } = useInstitutions();
  const save = useSaveInstitution();
  const remove = useDeleteInstitution();
  const [draft, setDraft] = useState({
    name: "",
    email_domain: "",
    website: "",
    country: "",
    category: "student",
  });

  const pending = useMemo(
    () => institutions.filter((i) => i.status === "pending"),
    [institutions],
  );
  const rest = useMemo(() => institutions.filter((i) => i.status !== "pending"), [institutions]);

  const add = async () => {
    if (!draft.name.trim() || !draft.email_domain.trim()) {
      toast.error("Name and email domain are required.");
      return;
    }
    try {
      await save.mutateAsync({ ...draft, status: "approved" });
      toast.success("Institution domain added");
      setDraft({ name: "", email_domain: "", website: "", country: "", category: "student" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
  };

  const setStatus = async (row: (typeof institutions)[number], status: "approved" | "rejected") => {
    try {
      await save.mutateAsync({
        id: row.id,
        name: row.name,
        email_domain: row.email_domain,
        website: row.website,
        country: row.country,
        category: row.category,
        status,
      });
      toast.success(status === "approved" ? "Domain approved" : "Domain rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a recognised domain</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="in-name">Institution name</Label>
            <Input
              id="in-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-domain">Email domain</Label>
            <Input
              id="in-domain"
              value={draft.email_domain}
              placeholder="university.edu"
              onChange={(e) => setDraft({ ...draft, email_domain: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-site">Website</Label>
            <Input
              id="in-site"
              value={draft.website}
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-country">Country</Label>
            <Input
              id="in-country"
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-category">Category</Label>
            <Select
              value={draft.category}
              onValueChange={(v) => setDraft({ ...draft, category: v })}
            >
              <SelectTrigger id="in-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERIFICATION_FORMS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={save.isPending} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add domain
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Requested by users</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pending.map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.email_domain}
                        {i.notes ? ` · ${i.notes}` : ""}
                      </span>
                    </span>
                    <Button size="sm" onClick={() => setStatus(i, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(i, "rejected")}>
                      Reject
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Domain directory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rest.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No domains yet. Add the schools and organizations you recognise.
                </p>
              ) : (
                rest.map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.email_domain}
                        {i.category ? ` · ${i.category}` : ""}
                      </span>
                    </span>
                    <Badge variant={i.status === "approved" ? "default" : "outline"}>
                      {i.status}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${i.name}`}
                      onClick={() => remove.mutate(i.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
