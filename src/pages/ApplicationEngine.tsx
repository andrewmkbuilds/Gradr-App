import { Zap, FileText, Mail, MessageSquare, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const applications = [
  { company: "Stripe", role: "Senior Frontend Engineer", date: "2 days ago", status: "Applied", hasResume: true, hasCover: true },
  { company: "Linear", role: "Product Designer", date: "5 days ago", status: "Interview", hasResume: true, hasCover: true },
  { company: "Vercel", role: "Full Stack Developer", date: "1 week ago", status: "Screening", hasResume: true, hasCover: false },
  { company: "Notion", role: "Software Engineer", date: "1 week ago", status: "Applied", hasResume: true, hasCover: true },
];

const statusIcon: Record<string, string> = {
  Applied: "text-primary bg-primary/10",
  Interview: "text-success bg-success/10",
  Screening: "text-warning bg-warning/10",
};

export default function ApplicationEngine() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Application Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">One-click application packs & tracking</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Zap className="h-4 w-4 mr-2" />
          Quick Apply
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: FileText, label: "Tailored Resumes", value: "8" },
          { icon: Mail, label: "Cover Letters", value: "6" },
          { icon: MessageSquare, label: "Outreach Messages", value: "4" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-5 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="stat-value text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-6 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Application Tracker</h3>
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={`${app.company}-${app.role}`} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{app.company[0]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{app.role}</p>
                  <p className="text-xs text-muted-foreground">{app.company} • {app.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex gap-1">
                  {app.hasResume && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                  {app.hasCover && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusIcon[app.status]}`}>
                  {app.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
