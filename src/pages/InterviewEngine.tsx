import { Mic, MessageSquare, Brain, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const predictedQuestions = [
  { category: "Behavioral", question: "Tell me about a time you resolved a conflict within your team." },
  { category: "Technical", question: "How would you design a real-time collaborative editing system?" },
  { category: "Behavioral", question: "Describe a project where you had to learn a new technology quickly." },
  { category: "System Design", question: "Walk me through how you'd build a notification service at scale." },
  { category: "Technical", question: "What's your approach to optimizing frontend performance?" },
];

const categoryColors: Record<string, string> = {
  Behavioral: "text-primary bg-primary/10",
  Technical: "text-warning bg-warning/10",
  "System Design": "text-success bg-success/10",
};

export default function InterviewEngine() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Interview Coach</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-powered preparation and mock interviews</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6 animate-slide-up group cursor-pointer hover:glow-border transition-all">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Mic className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Mock Interview</h3>
          <p className="text-sm text-muted-foreground mb-4">Practice with an AI interviewer tailored to your target role</p>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Start Session</Button>
        </div>

        <div className="glass-card p-6 animate-slide-up group cursor-pointer hover:glow-border transition-all">
          <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center mb-4 group-hover:bg-warning/20 transition-colors">
            <Brain className="h-6 w-6 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Rejection Analyzer</h3>
          <p className="text-sm text-muted-foreground mb-4">Understand why you didn't advance and how to improve</p>
          <Button variant="outline" className="border-border text-foreground hover:bg-secondary">Analyze</Button>
        </div>
      </div>

      <div className="glass-card p-6 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Predicted Questions</h3>
        <div className="space-y-3">
          {predictedQuestions.map((q, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColors[q.category]} mb-1 inline-block`}>
                  {q.category}
                </span>
                <p className="text-sm text-foreground/90">{q.question}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
