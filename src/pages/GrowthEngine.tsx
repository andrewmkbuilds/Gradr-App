import { Link } from "react-router-dom";
import { Code, Briefcase, GraduationCap, Construction, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const planned = [
  {
    icon: Code,
    title: "Skill Proof Generator",
    desc: "Portfolio project briefs generated from the real skill gaps found in jobs you save.",
  },
  {
    icon: Briefcase,
    title: "Experience Gap Fixer",
    desc: "Concrete plans built from the keyword gaps in your resume versus target roles.",
  },
  {
    icon: GraduationCap,
    title: "Portfolio Builder",
    desc: "Pair your resume with proof-of-work so applications carry evidence, not claims.",
  },
];

export default function GrowthEngine() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Growth &amp; Proof</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
            <Construction className="h-3.5 w-3.5" />
            Coming soon
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Bridge experience gaps and build proof of competence.
        </p>
      </div>

      <div className="glass-card p-6 sm:p-8">
        <h2 className="text-sm font-semibold text-foreground">This module isn't live yet</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          We're building Growth &amp; Proof on top of your real data — the skill gaps detected between
          your resume and the live jobs you match against. Until it can produce genuine, personalised
          output, we'd rather show nothing than show placeholder advice.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/match">
              Find real skill gaps in Job Matching <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/resume">Analyse your resume</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {planned.map((tool) => (
          <div key={tool.title} className="glass-card p-6 opacity-70">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <tool.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">{tool.title}</h3>
            <p className="text-xs text-muted-foreground">{tool.desc}</p>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground/70">In development</p>
          </div>
        ))}
      </div>
    </div>
  );
}
