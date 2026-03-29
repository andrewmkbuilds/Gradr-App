import { Rocket, Code, Briefcase, GraduationCap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const gaps = [
  { skill: "CI/CD Pipeline Experience", priority: "High", suggestion: "Build a GitHub Actions workflow for a personal project" },
  { skill: "System Design", priority: "Medium", suggestion: "Complete 3 system design case studies and document them" },
  { skill: "Leadership Experience", priority: "High", suggestion: "Lead an open-source project or mentor junior developers" },
  { skill: "Cloud Infrastructure", priority: "Medium", suggestion: "Get AWS Solutions Architect certification" },
];

const priorityColors: Record<string, string> = {
  High: "text-destructive bg-destructive/10",
  Medium: "text-warning bg-warning/10",
  Low: "text-success bg-success/10",
};

export default function GrowthEngine() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Growth & Proof</h1>
        <p className="text-sm text-muted-foreground mt-1">Bridge experience gaps and build proof of competence</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Code, title: "Skill Proof Generator", desc: "Create portfolio-ready project suggestions" },
          { icon: Briefcase, title: "Experience Gap Fixer", desc: "Actionable plans to fill resume gaps" },
          { icon: GraduationCap, title: "Portfolio Builder", desc: "Combine resume + portfolio for maximum impact" },
        ].map((tool) => (
          <div key={tool.title} className="glass-card p-6 animate-slide-up group cursor-pointer hover:glow-border transition-all">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <tool.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">{tool.title}</h3>
            <p className="text-xs text-muted-foreground">{tool.desc}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-6 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Identified Skill Gaps</h3>
        <div className="space-y-3">
          {gaps.map((g, i) => (
            <div key={i} className="flex items-start justify-between gap-4 p-4 rounded-lg bg-secondary/50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium text-foreground">{g.skill}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priorityColors[g.priority]}`}>
                    {g.priority}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{g.suggestion}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-primary shrink-0">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
