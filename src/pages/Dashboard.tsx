import { FileText, Target, Zap, Mic, TrendingUp, Briefcase } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { ScoreRing } from "@/components/ScoreRing";

const recentApplications = [
  { company: "Stripe", role: "Senior Frontend Engineer", status: "Applied", match: 94 },
  { company: "Linear", role: "Product Designer", status: "Interview", match: 87 },
  { company: "Vercel", role: "Full Stack Developer", status: "Screening", match: 91 },
  { company: "Notion", role: "Software Engineer", status: "Applied", match: 82 },
];

const statusColors: Record<string, string> = {
  Applied: "text-primary bg-primary/10",
  Interview: "text-success bg-success/10",
  Screening: "text-warning bg-warning/10",
  Rejected: "text-destructive bg-destructive/10",
};

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Career Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your AI-powered career command center</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} title="Resume Score" value="72" subtitle="+8 from last week" glowing />
        <StatCard icon={Target} title="Job Matches" value="24" subtitle="6 high-confidence" />
        <StatCard icon={Briefcase} title="Applications" value="12" subtitle="3 in progress" />
        <StatCard icon={TrendingUp} title="Interview Rate" value="33%" subtitle="Above average" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resume Health */}
        <div className="glass-card p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-foreground mb-4">Resume Health</h3>
          <div className="flex items-center justify-center py-4">
            <ScoreRing score={72} size={140} label="ATS Score" />
          </div>
          <div className="space-y-3 mt-4">
            {[
              { label: "Keyword Match", value: 65 },
              { label: "Formatting", value: 88 },
              { label: "Impact Statements", value: 54 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground">{item.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-1000"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Applications */}
        <div className="glass-card p-6 lg:col-span-2 animate-slide-up">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent Applications</h3>
          <div className="space-y-3">
            {recentApplications.map((app) => (
              <div
                key={`${app.company}-${app.role}`}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{app.company[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{app.role}</p>
                    <p className="text-xs text-muted-foreground">{app.company}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{app.match}% match</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[app.status]}`}>
                    {app.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-6 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: FileText, label: "Optimize Resume", desc: "Improve your ATS score" },
            { icon: Target, label: "Find Jobs", desc: "AI-matched opportunities" },
            { icon: Zap, label: "Quick Apply", desc: "Generate application pack" },
            { icon: Mic, label: "Mock Interview", desc: "Practice with AI coach" },
          ].map((action) => (
            <button
              key={action.label}
              className="flex flex-col items-start p-4 rounded-lg bg-secondary/50 hover:bg-secondary hover:glow-border transition-all text-left group"
            >
              <action.icon className="h-5 w-5 text-primary mb-3 group-hover:animate-pulse-glow" />
              <span className="text-sm font-medium text-foreground">{action.label}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{action.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
