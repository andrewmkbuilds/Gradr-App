import { useSeoOverride } from "@/lib/seoOverride";
import { useState, useCallback } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { Link } from "@/lib/router-compat";
import {
  Upload, FileText, CheckCircle, AlertTriangle, Sparkles, RefreshCw, Loader2, BookOpen,
  Target, Gauge, ChevronRight, XCircle,
} from "lucide-react";

import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { extractResumeText } from "@/lib/extractResumeText";
import { ResumeVersions } from "@/components/resume/ResumeVersions";

interface Suggestion {
  type: string;
  text: string;
}

interface Evidence {
  label: string;
  detail: string;
  ok: boolean;
}

interface AnalysisResult {
  ats_score: number;
  keyword_match: number;
  formatting_score: number;
  impact_score: number;
  readability_score: number;
  suggestions: Suggestion[];
  evidence?: Evidence[];
  rewrites?: { before: string; after: string }[];
  tailoredTo?: string | null;
  metrics?: {
    wordCount: number;
    quantifiedBullets: number;
    actionVerbCount: number;
    missingSkills: string[];
    matchedKeywords: string[];
    fleschReadingEase: number;
  };
}

const typeStyles: Record<string, { icon: typeof CheckCircle; color: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  improvement: { icon: Sparkles, color: "accent-text" },
  good: { icon: CheckCircle, color: "text-success" },
};

export default function ResumeEngine() {
  useSeoOverride(
    jobTitle.trim()
      ? {
          title: `Resume Engine — tailoring for ${jobTitle.trim()}`,
          description: `ATS scoring and AI rewrites for your resume against the ${jobTitle.trim()} role.`,
        }
      : null,
  );
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [showTailor, setShowTailor] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [versionsToken, setVersionsToken] = useState(0);

  const handleFileUpload = useCallback(async (selectedFile: File) => {
    if (!user) {
      toast.error("Please sign in to upload a resume");
      return;
    }

    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith(".txt")) {
      toast.error("Please upload a PDF, DOCX, or TXT file");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setUploading(true);

    try {
      const filePath = `${user.id}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const text = await extractResumeText(selectedFile);

      setUploading(false);
      setAnalyzing(true);

      const { data: analysisData, error: fnError } = await invokeFunction("analyze-resume", {
        body: { resumeText: text, jobDescription, jobTitle, environment: getPaddleEnvironment() },
      });

      if (fnError || analysisData?.error) {
        if (handleAiFunctionError(fnError, analysisData)) return;
        throw fnError ?? new Error(analysisData?.error || "Analysis failed");
      }

      setAnalysis(analysisData);

      const versionLabel = jobTitle.trim()
        ? `${jobTitle.trim()} — ${selectedFile.name.replace(/\.[^.]+$/, "")}`
        : selectedFile.name.replace(/\.[^.]+$/, "");

      const { data: saved } = await supabase
        .from("resumes")
        .insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_path: filePath,
          file_type: selectedFile.type,
          version_label: versionLabel,
          ats_score: analysisData.ats_score,
          keyword_match: analysisData.keyword_match,
          formatting_score: analysisData.formatting_score,
          impact_score: analysisData.impact_score,
          readability_score: analysisData.readability_score,
          ai_suggestions: analysisData.suggestions,
          parsed_text: text.substring(0, 10000),
        })
        .select("id")
        .maybeSingle();

      setActiveVersionId(saved?.id ?? null);
      setVersionsToken((t) => t + 1);

      toast.success("Resume analyzed and saved as a version");
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze resume");
      console.error(error);
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  }, [user, jobDescription, jobTitle]);

  const handleRescan = async () => {
    if (!file) return;
    setAnalysis(null);
    await handleFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileUpload(droppedFile);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileUpload(selectedFile);
  };

  const tailorPanel = (
    <div className="glass-card p-5 animate-slide-up">
      <button
        type="button"
        onClick={() => setShowTailor((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" />
          Tailor to a specific job
          {jobDescription.trim().length > 40 && (
            <span className="accent-chip px-2 py-0.5 text-[10px]">Active</span>
          )}
        </span>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showTailor ? "rotate-90" : ""}`} />
      </button>
      {showTailor && (
        <div className="mt-4 space-y-3">
          <Input
            placeholder="Job title (optional)"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="bg-secondary/40"
          />
          <Textarea
            placeholder="Paste the full job description to score keyword coverage against this exact role…"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={6}
            className="bg-secondary/40 resize-y"
          />
          <p className="text-xs text-muted-foreground">
            With a job description, keyword match is measured against the posting instead of a general skill lexicon.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Resume Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deterministic ATS scoring, keyword overlap and readability analysis — every number computed from your actual text.
        </p>
        <Link
          to="/blog/ai-resume-optimization?utm_source=app&utm_medium=internal_link&utm_campaign=ai_resume_optimization&utm_content=resume_engine_header"
          className="accent-link mt-3 inline-flex items-center gap-2 text-xs"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Guide: AI resume builders & ATS optimization
        </Link>
        <Link
          to="/ats-resume-checker?utm_source=app&utm_medium=internal_link&utm_campaign=ats_resume_checker&utm_content=resume_engine_header"
          className="accent-link mt-2 ml-0 inline-flex items-center gap-2 text-xs sm:ml-4"
        >
          <BookOpen className="h-3.5 w-3.5" />
          ATS resume checker: how scoring works
        </Link>
      </div>

      {!uploading && !analyzing && tailorPanel}

      {!uploading && !analyzing && (
        <ResumeVersions
          key={versionsToken}
          activeId={activeVersionId}
          onSelect={(v) => {
            setActiveVersionId(v.id);
            setFileName(v.file_name);
            setAnalysis({
              ats_score: v.ats_score ?? 0,
              keyword_match: v.keyword_match ?? 0,
              formatting_score: v.formatting_score ?? 0,
              impact_score: v.impact_score ?? 0,
              readability_score: v.readability_score ?? 0,
              suggestions: Array.isArray(v.ai_suggestions) ? (v.ai_suggestions as Suggestion[]) : [],
              tailoredTo: v.version_label,
            });
          }}
        />
      )}

      {!analysis && !uploading && !analyzing ? (
        <label
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="glass-card p-12 flex flex-col items-center justify-center cursor-pointer hover:glow-border transition-all group animate-slide-up"
        >
          <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleInputChange} />
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Upload Your Resume</h3>
          <p className="text-sm text-muted-foreground mb-4">PDF, DOCX, or TXT • Max 10MB</p>
          <div className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
            Click to upload or drag & drop
          </div>
        </label>
      ) : (uploading || analyzing) ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center animate-slide-up">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {uploading ? "Uploading resume..." : "Scoring your resume..."}
          </h3>
          <p className="text-sm text-muted-foreground">This may take a moment</p>
        </div>
      ) : analysis ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
          {/* Score Panel */}
          <div className="glass-card p-6 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-foreground mb-6 self-start">ATS Score</h3>
            <ScoreRing score={analysis.ats_score} size={160} />
            <p className="text-sm text-muted-foreground mt-4 text-center">
              {analysis.ats_score >= 80
                ? "Great — your resume is well-optimized for ATS parsing."
                : analysis.ats_score >= 60
                ? "Solid base, but keyword and impact gaps will cost you screens."
                : "Significant structural and keyword work needed."}
            </p>
            {analysis.tailoredTo && (
              <p className="accent-text mt-2 text-xs text-center font-medium">Scored against {analysis.tailoredTo}</p>
            )}
            <div className="w-full mt-6 space-y-2">
              {[
                { label: "Keyword Match", value: analysis.keyword_match },
                { label: "Formatting", value: analysis.formatting_score },
                { label: "Impact Score", value: analysis.impact_score },
                { label: "Readability", value: analysis.readability_score },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="text-foreground">{m.value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${m.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          <div className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Fix list</h3>
              <span className="text-xs text-muted-foreground">{analysis.suggestions.length} items</span>
            </div>
            <div className="space-y-3">
              {analysis.suggestions.map((s, i) => {
                const style = typeStyles[s.type] || typeStyles.improvement;
                const Icon = style.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.color}`} />
                    <p className="text-sm text-foreground/90">{s.text}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-6">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleRescan}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-scan
              </Button>
              <label>
                <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleInputChange} />
                <Button variant="outline" className="border-border text-foreground hover:bg-secondary" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New
                  </span>
                </Button>
              </label>
            </div>
          </div>

          {/* Evidence */}
          {analysis.evidence?.length ? (
            <div className="glass-card p-6 lg:col-span-2">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Gauge className="h-4 w-4 text-primary" />
                How these scores were calculated
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {analysis.evidence.map((e) => (
                  <div key={e.label} className="flex items-start gap-2.5 rounded-lg bg-secondary/40 p-3">
                    {e.ok ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{e.label}</p>
                      <p className="break-words text-xs text-muted-foreground">{e.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Keyword gaps */}
          {analysis.metrics?.missingSkills?.length ? (
            <div className="glass-card p-6">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Missing job keywords</h3>
              <div className="flex flex-wrap gap-1.5">
                {analysis.metrics.missingSkills.slice(0, 20).map((s) => (
                  <span key={s} className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{s}</span>
                ))}
              </div>
              {analysis.metrics.matchedKeywords?.length ? (
                <>
                  <h4 className="mb-2 mt-5 text-xs font-medium text-muted-foreground">Already covered</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.metrics.matchedKeywords.slice(0, 20).map((s) => (
                      <span key={s} className="rounded-md bg-success/10 px-2 py-1 text-xs text-success">{s}</span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {/* Rewrites */}
          {analysis.rewrites?.length ? (
            <div className="glass-card p-6 lg:col-span-3">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Suggested bullet rewrites</h3>
              <div className="space-y-3">
                {analysis.rewrites.map((r, i) => (
                  <div key={i} className="grid gap-2 rounded-lg bg-secondary/40 p-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Before</p>
                      <p className="text-sm text-muted-foreground line-through decoration-destructive/40">{r.before}</p>
                    </div>
                    <div>
                      <p className="accent-text mb-1 text-[10px] font-semibold uppercase tracking-wide">After</p>
                      <p className="text-sm text-foreground">{r.after}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Resume Preview */}
          <div className="glass-card p-6 lg:col-span-3">
            <h3 className="text-sm font-semibold text-foreground mb-4">Uploaded Resume</h3>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
              <FileText className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {analysis.metrics ? `${analysis.metrics.wordCount} words • ${analysis.metrics.actionVerbCount} action verbs • Flesch ${analysis.metrics.fleschReadingEase}` : "Analyzed just now"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
