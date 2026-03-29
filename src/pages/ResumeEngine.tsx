import { useState, useCallback } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Suggestion {
  type: string;
  text: string;
}

interface AnalysisResult {
  ats_score: number;
  keyword_match: number;
  formatting_score: number;
  impact_score: number;
  readability_score: number;
  suggestions: Suggestion[];
}

const typeStyles: Record<string, { icon: typeof CheckCircle; color: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  improvement: { icon: Sparkles, color: "text-primary" },
  good: { icon: CheckCircle, color: "text-success" },
};

export default function ResumeEngine() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState("");

  const extractTextFromFile = async (file: File): Promise<string> => {
    // For text-based files or as fallback, read as text
    return await file.text();
  };

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
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.txt')) {
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
      // Upload to storage
      const filePath = `${user.id}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Extract text for analysis
      const text = await extractTextFromFile(selectedFile);

      setUploading(false);
      setAnalyzing(true);

      // Call AI analysis
      const { data: analysisData, error: fnError } = await supabase.functions.invoke("analyze-resume", {
        body: { resumeText: text },
      });

      if (fnError) throw fnError;
      if (analysisData?.error) throw new Error(analysisData.error);

      setAnalysis(analysisData);

      // Save to DB
      await supabase.from("resumes").insert({
        user_id: user.id,
        file_name: selectedFile.name,
        file_path: filePath,
        file_type: selectedFile.type,
        ats_score: analysisData.ats_score,
        keyword_match: analysisData.keyword_match,
        formatting_score: analysisData.formatting_score,
        impact_score: analysisData.impact_score,
        readability_score: analysisData.readability_score,
        ai_suggestions: analysisData.suggestions,
        parsed_text: text.substring(0, 10000),
      });

      toast.success("Resume analyzed successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze resume");
      console.error(error);
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  }, [user]);

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Resume Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered resume analysis and optimization</p>
      </div>

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
            {uploading ? "Uploading resume..." : "AI is analyzing your resume..."}
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
                ? "Great! Your resume is well-optimized for ATS."
                : analysis.ats_score >= 60
                ? "Your resume needs some optimization to pass most ATS filters."
                : "Your resume needs significant improvement for ATS compatibility."}
            </p>
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
                    <div className="h-full rounded-full bg-primary" style={{ width: `${m.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          <div className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">AI Suggestions</h3>
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
            <div className="flex gap-3 mt-6">
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

          {/* Resume Preview */}
          <div className="glass-card p-6 lg:col-span-3">
            <h3 className="text-sm font-semibold text-foreground mb-4">Uploaded Resume</h3>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{fileName}</p>
                <p className="text-xs text-muted-foreground">Analyzed just now</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
