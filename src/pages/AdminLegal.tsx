import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ScrollText, Send, Upload, Eye, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAffiliate";
import {
  resolveLegalBody,
  useAdminLegalDocuments,
  type LegalDocType,
  type LegalDocument,
} from "@/hooks/useLegalDocuments";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const TYPES: { id: LegalDocType; label: string }[] = [
  { id: "privacy", label: "Privacy Notice" },
  { id: "terms", label: "Terms & Conditions" },
];

const STATUS_STYLE: Record<string, string> = {
  published: "bg-success/10 text-success",
  draft: "bg-primary/10 text-primary",
  archived: "bg-muted text-muted-foreground",
};

export default function AdminLegal() {
  const { user, loading: authLoading } = useAuth();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const { documents, stats, loading, refresh } = useAdminLegalDocuments(Boolean(isAdmin));

  const [docType, setDocType] = useState<LegalDocType>("privacy");
  const [draftTitle, setDraftTitle] = useState("Privacy Notice");
  const [draftBody, setDraftBody] = useState("");
  const [summary, setSummary] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requiresAcceptance, setRequiresAcceptance] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LegalDocument | null>(null);

  const byType = useMemo(
    () => documents.filter((d) => d.doc_type === docType),
    [documents, docType],
  );
  const nextVersion = (byType[0]?.version ?? 0) + 1;
  const statFor = (id: string) => stats.find((s) => s.document_id === id);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const createDraft = async () => {
    if (!draftBody.trim()) {
      toast.error("Add the document body first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("legal_documents").insert({
      doc_type: docType,
      version: nextVersion,
      status: "draft",
      title: draftTitle,
      content: draftBody,
      summary_of_changes: summary || null,
      requires_acceptance: requiresAcceptance,
      effective_date: effectiveDate,
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Draft v${nextVersion} created.`);
    setDraftBody("");
    setSummary("");
    await refresh();
  };

  const publish = async (doc: LegalDocument) => {
    setBusy(true);
    const { error } = await adminRpc("admin_publish_legal_document", { _document_id: doc.id }, {
      requestId: newRequestId(`publish-legal-${doc.id}`),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${doc.title} v${doc.version} published.`);
    await refresh();
  };

  const notify = async (doc: LegalDocument) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("notify-policy-update", {
      body: { document_id: doc.id },
    });
    setBusy(false);
    if (error) {
      toast.error("Notification send failed.");
      return;
    }
    toast.success(`Notified ${(data as { sent?: number })?.sent ?? 0} users.`);
  };

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<ScrollText className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Legal documents"
        description="Draft, preview, publish and track acceptance of the Terms & Conditions and Privacy Notice."
      />

      <Tabs value={docType} onValueChange={(v) => { setDocType(v as LegalDocType); setDraftTitle(TYPES.find(t => t.id === v)!.label); }}>
        <TabsList>
          {TYPES.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {TYPES.map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-6 pt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {!loading && byType.length === 0 && (
                  <p className="text-sm text-muted-foreground">No versions yet.</p>
                )}
                {byType.map((doc) => {
                  const s = statFor(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">v{doc.version}</span>
                          <Badge variant="secondary" className={STATUS_STYLE[doc.status]}>{doc.status}</Badge>
                          {doc.requires_acceptance && <Badge variant="outline">re-acceptance</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Effective {doc.effective_date}
                          {s ? ` · accepted by ${s.accepted_count} of ${s.total_users} users` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setPreview(doc)}>
                          <Eye className="mr-1.5 h-4 w-4" /> Preview
                        </Button>
                        {doc.status === "draft" && (
                          <Button size="sm" disabled={busy} onClick={() => publish(doc)}>
                            <Upload className="mr-1.5 h-4 w-4" /> Publish
                          </Button>
                        )}
                        {doc.status === "published" && doc.requires_acceptance && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => notify(doc)}>
                            <Send className="mr-1.5 h-4 w-4" /> Email users
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">New draft (v{nextVersion})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="legal-title">Title</Label>
                    <Input id="legal-title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="legal-date">Effective date</Label>
                    <Input
                      id="legal-date"
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="legal-summary">Summary of material changes</Label>
                  <Textarea
                    id="legal-summary"
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Plain-English list of what changed and why."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="legal-body">Body (markdown: ## heading, - bullet, **bold**, [link](url))</Label>
                  <Textarea
                    id="legal-body"
                    rows={14}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium">Require re-acceptance</p>
                    <p className="text-xs text-muted-foreground">
                      Users are blocked until they explicitly accept this version.
                    </p>
                  </div>
                  <Switch aria-label="Require explicit acceptance of this version" checked={requiresAcceptance} onCheckedChange={setRequiresAcceptance} />
                </div>
                <Button onClick={createDraft} disabled={busy}>
                  <Plus className="mr-1.5 h-4 w-4" /> Save draft
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {preview?.title} · v{preview?.version}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <PolicyDocument
              body={resolveLegalBody(preview)}
              meta={`Effective ${preview.effective_date}`}
              summary={preview.summary_of_changes}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
