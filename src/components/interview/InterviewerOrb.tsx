import { cn } from "@/lib/utils";

export type InterviewerState = "connecting" | "speaking" | "listening" | "thinking" | "idle";

const STATE_COPY: Record<InterviewerState, string> = {
  connecting: "Connecting",
  speaking: "Speaking",
  listening: "Listening",
  thinking: "Thinking",
  idle: "Ready",
};

interface Props {
  state: InterviewerState;
  name?: string;
  className?: string;
}

/**
 * Interviewer presence orb — the visual anchor of the interview studio.
 *
 * Conveys speaking / listening / thinking through layered rings and a voice
 * bar equaliser. All motion is disabled under `prefers-reduced-motion`, where
 * the state is still legible from colour and the text label.
 */
export function InterviewerOrb({ state, name = "AI Interviewer", className }: Props) {
  const active = state === "speaking" || state === "listening";

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <div className="relative flex items-center justify-center" aria-hidden="true">
        {/* Ambient halo */}
        <div
          className={cn(
            "absolute h-44 w-44 rounded-full blur-2xl transition-opacity duration-500 sm:h-56 sm:w-56",
            state === "speaking" && "bg-primary/30 opacity-100",
            state === "listening" && "bg-primary/15 opacity-100",
            state === "thinking" && "bg-primary/10 opacity-100",
            (state === "idle" || state === "connecting") && "bg-primary/5 opacity-70",
          )}
        />

        {/* Pulse rings — only while the interviewer holds the floor */}
        {active && (
          <>
            <span className="absolute h-32 w-32 rounded-full border border-primary/30 motion-safe:animate-ping sm:h-40 sm:w-40" />
            <span
              className="absolute h-32 w-32 rounded-full border border-primary/20 motion-safe:animate-ping sm:h-40 sm:w-40"
              style={{ animationDelay: "0.6s" }}
            />
          </>
        )}

        {/* Core */}
        <div
          className={cn(
            "relative flex h-28 w-28 items-center justify-center rounded-full border transition-all duration-300 sm:h-36 sm:w-36",
            "bg-[radial-gradient(circle_at_30%_25%,hsl(var(--primary)/0.35),hsl(var(--card))_70%)]",
            state === "speaking" ? "border-primary/70 shadow-[0_0_50px_-12px_hsl(var(--primary)/0.8)]" : "border-border",
            state === "listening" && "border-primary/40",
          )}
        >
          {/* Voice equaliser */}
          <div className="flex h-10 items-end gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  "w-1.5 rounded-full bg-primary transition-all duration-300",
                  state === "speaking"
                    ? "motion-safe:animate-[pulse_0.9s_ease-in-out_infinite]"
                    : "opacity-40",
                )}
                style={{
                  height:
                    state === "speaking"
                      ? `${[40, 72, 100, 64, 34][i]}%`
                      : state === "listening"
                        ? `${[24, 34, 28, 38, 22][i]}%`
                        : "18%",
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold tracking-tight text-foreground">{name}</p>
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            state === "speaking" || state === "listening" ? "text-primary" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {STATE_COPY[state]}
          {state === "thinking" && <span className="motion-safe:animate-pulse">…</span>}
        </p>
      </div>
    </div>
  );
}
