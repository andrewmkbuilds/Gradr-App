import { useState } from "react";
import { Zap, FileText, Mail, MessageSquare, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";

type GenerationType = "cover_letter" | "recruiter_message";

interface GeneratedContent {
  subject: string;
  body: string;
}

export default function ApplicationEngine() {
  const { user } = useAuth();
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState<GenerationType | null>(null);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async (type: GenerationType) => {
    if (!user) { toast.error("Please sign in first"); return; }

    setLoading(true);
    setActiveType(type);
    setResult(null);

    try {
      const { data: resumes } = await supabase
        .from("resumes")
        .select("parsed_text")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const resumeText = resumes?.[0]?.parsed_text || "";
      if (!resumeText) {
        toast.error("Upload a resume first in the Resume Intelligence page");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      const { data, error } = await supabase.functions.invoke("generate-application", {
        body: {
          type,
          resumeText,
          jobTitle: jobTitle || undefined,
          company: company || undefined,
          jobDescription: jobDescription || undefined,
          userName: profile?.display_name || user.email,
        },
      });

      if (error || data?.error) {
        if (handleAiFunctionError(error, data)) { setLoading(false); return; }
        throw error ?? new Error(data?.error || "Generation failed");
      }

      setResult(data);
      toast.success(`${type === "cover_letter" ? "Cover letter" : "Recruiter message"} generated!`);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(`${result.subject}\n\n${result.body}`);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Application Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered cover letters & recruiter outreach</p>
      </div>

      {/* Input Fields */}
      <div className="glass-card p-6 animate-slide-up space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Target Position</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            placeholder="Job title (e.g., Senior Frontend Engineer)"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="bg-secondary border-border"
          />
          <Input
            placeholder="Company name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="bg-secondary border-border"
          />
        </div>
        <Textarea
          placeholder="Paste the job description (optional — improves quality)"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className="bg-secondary border-border min-h-[100px]"
        />
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6 animate-slide-up group hover:glow-border transition-all">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Cover Letter</h3>
          <p className="text-sm text-muted-foreground mb-4">AI-tailored cover letter based on your resume and job description</p>
          <Button
            onClick={() => generate("cover_letter")}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading && activeType === "cover_letter" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            Generate Cover Letter
          </Button>
        </div>

        <div className="glass-card p-6 animate-slide-up group hover:glow-border transition-all">
          <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center mb-4 group-hover:bg-warning/20 transition-colors">
            <MessageSquare className="h-6 w-6 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Recruiter Message</h3>
          <p className="text-sm text-muted-foreground mb-4">Concise outreach message for recruiters or hiring managers</p>
          <Button
            onClick={() => generate("recruiter_message")}
            disabled={loading}
            variant="outline"
            className="border-border text-foreground hover:bg-secondary"
          >
            {loading && activeType === "recruiter_message" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
            Generate Message
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {activeType === "cover_letter" ? "Cover Letter" : "Recruiter Message"}
            </h3>
            <Button variant="ghost" size="sm" onClick={copyToClipboard} className="text-muted-foreground hover:text-foreground">
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
            <p className="text-sm font-medium text-foreground">{result.subject}</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{result.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
