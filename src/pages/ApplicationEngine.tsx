import { useCallback, useState } from "react";
import { FileText, Mail, MessageSquare, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Input, Textarea } from "@/design-system/gradr-9b9b95";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ProGate } from "@/components/ProGate";
import { CreditsBalance } from "@/components/CreditsBalance";
import { GenerationStream } from "@/components/ai/GenerationStream";
import { useAiStream } from "@/hooks/useAiStream";
import { PageHeader } from "@/components/app/PageHeader";

type GenerationType = "cover_letter" | "recruiter_message";

interface GeneratedContent {
  subject: string;
  body: string;
}

const TITLES: Record<GenerationType, string> = {
  cover_letter: "Cover letter",
  recruiter_message: "Recruiter message",
};

function ApplicationEngineInner() {
  const { user } = useAuth();
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [activeType, setActiveType] = useState<GenerationType | null>(null);
  const [copied, setCopied] = useState(false);

  const stream = useAiStream<GeneratedContent>({
    fn: "generate-application",
    initialLabel: "Reading your resume",
    onResult: () => {
      toast.success(`${TITLES[activeType ?? "cover_letter"]} ready`);
    },
  });

  const generate = useCallback(
    async (type: GenerationType) => {
      if (!user) {
        toast.error("Please sign in first");
        return;
      }

      setActiveType(type);
      setCopied(false);
      setPreparing(true);

      try {
        const { data: resumes } = await supabase
          .from("resumes")
          .select("parsed_text")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const resumeText = resumes?.[0]?.parsed_text || "";
        if (!resumeText) {
          toast.error("Upload a resume first in Resume Intelligence");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .single();

        await stream.start({
          environment: getPaddleEnvironment(),
          type,
          resumeText,
          jobTitle: jobTitle || undefined,
          company: company || undefined,
          jobDescription: jobDescription || undefined,
          userName: profile?.display_name || user.email,
        });
      } catch (e: any) {
        toast.error(e?.message || "Generation failed");
      } finally {
        setPreparing(false);
      }
    },
    [company, jobDescription, jobTitle, stream, user],
  );

  const result = stream.result;
  const busy = preparing || stream.isStreaming;

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(`${result.subject}\n\n${result.body}`);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-shell page-stack mx-auto max-w-6xl">
      <PageHeader
        title="Application Engine"
        description="AI-drafted cover letters and recruiter outreach, tailored to your resume."
      />
      <CreditsBalance only="application" compact />

      {/* Target position */}
      <div className="elev-2 pad-panel space-y-4 rounded-xl">
        <h2 className="type-h3 text-foreground">Target position</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            placeholder="Job title (e.g. Senior Frontend Engineer)"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            aria-label="Job title"
          />
          <Input
            placeholder="Company name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="Company name"
          />
        </div>
        <Textarea
          placeholder="Paste the job description (optional — improves quality)"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          aria-label="Job description"
        />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="elev-2 pad-panel group rounded-xl transition-all">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
            <Mail className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="type-h3 mb-1 text-foreground">Cover letter</h2>
          <p className="measure type-body-sm mb-4 text-muted-foreground">
            A tailored letter built from your resume and the job description.
          </p>
          <Button onClick={() => generate("cover_letter")} disabled={busy} className="min-h-11">
            {busy && activeType === "cover_letter" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Generate cover letter
          </Button>
        </div>

        <div className="elev-2 pad-panel group rounded-xl transition-all">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mahogany-soft transition-colors group-hover:bg-mahogany/20">
            <MessageSquare className="h-6 w-6 text-mahogany" aria-hidden="true" />
          </div>
          <h2 className="type-h3 mb-1 text-foreground">Recruiter message</h2>
          <p className="measure type-body-sm mb-4 text-muted-foreground">
            Concise outreach for recruiters or hiring managers.
          </p>
          <Button onClick={() => generate("recruiter_message")} disabled={busy} variant="outline" className="min-h-11">
            {busy && activeType === "recruiter_message" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Generate message
          </Button>
        </div>
      </div>

      {/* Streamed output */}
      <GenerationStream
        status={stream.status}
        progress={stream.progress}
        label={stream.label}
        text={stream.text}
        error={stream.error}
        title={TITLES[activeType ?? "cover_letter"]}
        description="Drafted from your latest resume."
        onCancel={stream.cancel}
        onRetry={stream.retry}
      >
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="type-h4 text-foreground">{result.subject}</p>
              <Button variant="ghost" size="sm" onClick={copyToClipboard} className="min-h-11 shrink-0 sm:min-h-9">
                {copied ? (
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="measure-wide type-body whitespace-pre-wrap rounded-lg bg-secondary/50 p-4 text-foreground/85">
              {result.body}
            </p>
          </div>
        ) : null}
      </GenerationStream>
    </div>
  );
}

export default function ApplicationEngine() {
  return (
    <ProGate
      feature="Application Engine"
      description="Generate unlimited tailored applications with Pro, or buy an extra applications pack."
      creditType="application"
    >
      <ApplicationEngineInner />
    </ProGate>
  );
}
