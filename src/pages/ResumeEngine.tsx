import { useState } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";

const suggestions = [
  { type: "critical", text: "Add quantifiable metrics to 4 bullet points (e.g., 'increased revenue by 30%')" },
  { type: "critical", text: "Include missing ATS keywords: 'CI/CD', 'Agile', 'Stakeholder Management'" },
  { type: "warning", text: "Summary section is too generic — personalize for target role" },
  { type: "improvement", text: "Replace passive voice in 6 bullet points for stronger impact" },
  { type: "improvement", text: "Add a 'Technical Skills' section with proficiency levels" },
  { type: "good", text: "Contact information is well-formatted and complete" },
  { type: "good", text: "Education section follows best practices" },
];

const typeStyles: Record<string, { icon: typeof CheckCircle; color: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  improvement: { icon: Sparkles, color: "text-primary" },
  good: { icon: CheckCircle, color: "text-success" },
};

export default function ResumeEngine() {
  const [uploaded, setUploaded] = useState(false);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Resume Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered resume analysis and optimization</p>
      </div>

      {!uploaded ? (
        <div
          onClick={() => setUploaded(true)}
          className="glass-card p-12 flex flex-col items-center justify-center cursor-pointer hover:glow-border transition-all group animate-slide-up"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Upload Your Resume</h3>
          <p className="text-sm text-muted-foreground mb-4">PDF or DOCX • Max 10MB</p>
          <div className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
            Click to upload or drag & drop
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
          {/* Score Panel */}
          <div className="glass-card p-6 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-foreground mb-6 self-start">ATS Score</h3>
            <ScoreRing score={72} size={160} />
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Your resume needs optimization to pass most ATS filters.
            </p>
            <div className="w-full mt-6 space-y-2">
              {[
                { label: "Keyword Match", value: 65 },
                { label: "Formatting", value: 88 },
                { label: "Impact Score", value: 54 },
                { label: "Readability", value: 79 },
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
              <span className="text-xs text-muted-foreground">{suggestions.length} items</span>
            </div>
            <div className="space-y-3">
              {suggestions.map((s, i) => {
                const style = typeStyles[s.type];
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
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Sparkles className="h-4 w-4 mr-2" />
                Auto-Optimize Resume
              </Button>
              <Button variant="outline" className="border-border text-foreground hover:bg-secondary">
                <RefreshCw className="h-4 w-4 mr-2" />
                Re-scan
              </Button>
            </div>
          </div>

          {/* Resume Preview */}
          <div className="glass-card p-6 lg:col-span-3">
            <h3 className="text-sm font-semibold text-foreground mb-4">Uploaded Resume</h3>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/50">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">resume_john_doe_2024.pdf</p>
                <p className="text-xs text-muted-foreground">2 pages • Uploaded just now</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
