import { CalendarDays, Target, Dumbbell, MessageSquareQuote } from "lucide-react";

export interface PracticePlanDay {
  day: number;
  theme: string;
  minutes: number;
  objective: string;
  questions: string[];
  drills: string[];
}

export interface PracticePlan {
  focusAreas: string[];
  summary: string;
  days: PracticePlanDay[];
}

/** Renders a personalised 7-day follow-up practice plan. */
export function PracticePlanView({ plan }: { plan: PracticePlan }) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="elev-2 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Your 7-day practice plan</h3>
        </div>
        <p className="text-sm text-muted-foreground">{plan.summary}</p>
        {plan.focusAreas?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {plan.focusAreas.map((f) => (
              <span key={f} className="text-xs rounded-full border border-primary/30 bg-primary/10 text-primary px-2.5 py-1">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      <ol className="space-y-3">
        {plan.days.map((d) => (
          <li key={d.day} className="elev-2 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                  {d.day}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{d.theme}</p>
                  <p className="text-xs text-muted-foreground">{d.minutes} min</p>
                </div>
              </div>
              <Target className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground">{d.objective}</p>

            {d.questions?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <MessageSquareQuote className="h-3.5 w-3.5 text-primary" /> Practice questions
                </p>
                <ul className="space-y-1">
                  {d.questions.map((q, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary">•</span><span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.drills?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Dumbbell className="h-3.5 w-3.5 text-primary" /> Drills
                </p>
                <ul className="space-y-1">
                  {d.drills.map((q, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary">•</span><span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
