import { Target, TrendingUp, MapPin, DollarSign, Star } from "lucide-react";
import { ScoreRing } from "@/components/ScoreRing";

const jobs = [
  { title: "Senior Frontend Engineer", company: "Stripe", location: "Remote", salary: "$180-220k", match: 94, skills: ["React", "TypeScript", "Node.js"] },
  { title: "Full Stack Developer", company: "Vercel", location: "SF / Remote", salary: "$160-200k", match: 91, skills: ["Next.js", "React", "PostgreSQL"] },
  { title: "Software Engineer II", company: "Linear", location: "Remote (EU)", salary: "$150-190k", match: 87, skills: ["TypeScript", "React", "GraphQL"] },
  { title: "Frontend Engineer", company: "Notion", location: "NYC", salary: "$170-210k", match: 82, skills: ["React", "CSS", "Performance"] },
  { title: "Product Engineer", company: "Raycast", location: "Remote", salary: "$140-180k", match: 78, skills: ["React", "Swift", "Electron"] },
];

export default function JobMatchingEngine() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Job Matching</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-curated opportunities matched to your profile</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Active Matches</span>
          </div>
          <p className="stat-value text-foreground">24</p>
        </div>
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-warning" />
            <span className="text-xs text-muted-foreground">High Confidence</span>
          </div>
          <p className="stat-value text-foreground">6</p>
        </div>
        <div className="glass-card p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-xs text-muted-foreground">Avg Match Score</span>
          </div>
          <p className="stat-value text-foreground">86%</p>
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={`${job.company}-${job.title}`} className="glass-card p-5 hover:glow-border transition-all animate-slide-up">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <ScoreRing score={job.match} size={56} />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{job.title}</h3>
                  <p className="text-xs text-muted-foreground">{job.company}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {job.location}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" /> {job.salary}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {job.skills.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
