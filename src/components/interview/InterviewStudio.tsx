import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, MicOff, Send, Loader2, RotateCcw, User, Bot, Volume2, VolumeX,
  Square, Radio, Hand, Zap, Captions, WifiOff, Search, X, ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CameraMonitor } from "@/components/interview/CameraMonitor";
import { InterviewerOrb, type InterviewerState } from "@/components/interview/InterviewerOrb";
import { ConnectionErrorOverlay } from "@/components/interview/ConnectionErrorOverlay";
import type { IntegritySnapshot } from "@/lib/cv/faceMonitor";

export type Msg = { role: "user" | "assistant"; content: string };

interface Limits {
  tier: string;
  sessionsPerMonth: number | null;
  sessionsRemaining: number | null;
  maxSessionMinutes: number;
}

interface Props {
  targetRole: string;
  messages: Msg[];
  partialUser: string;
  partialModel: string;
  interviewerState: InterviewerState;
  realtime: boolean;
  connecting: boolean;
  canReconnect: boolean;
  micMuted: boolean;
  micLabel: string;
  voiceOn: boolean;
  thinking: boolean;
  ending: boolean;
  input: string;
  limits: Limits | null;
  startedAt: number;
  connectionLost?: boolean;
  onDismissConnectionError?: () => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onToggleMic: () => void;
  onToggleVoice: () => void;
  onInterrupt: () => void;
  onReconnect: () => void;
  onEnd: () => void;
  onReset: () => void;
  onSnapshot: (s: IntegritySnapshot) => void;
}

/** Splits text into highlighted / plain segments for the transcript search. */
function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(needle);
  while (idx !== -1) {
    if (idx > i) parts.push({ text: text.slice(i, idx), match: false });
    parts.push({ text: text.slice(idx, idx + needle.length), match: true });
    i = idx + needle.length;
    idx = lower.indexOf(needle, i);
  }
  if (i < text.length) parts.push({ text: text.slice(i), match: false });
  return parts;
}

function formatClock(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * The live interview studio.
 *
 * Interviewer presence, live captions, transcript, presence monitoring and the
 * control dock in one cohesive room — designed to read clearly at every
 * breakpoint and to stay legible with motion disabled.
 */
export function InterviewStudio(props: Props) {
  const {
    targetRole, messages, partialUser, partialModel, interviewerState, realtime, connecting,
    canReconnect, micMuted, micLabel, voiceOn, thinking, ending, input, limits, startedAt,
    onInputChange, onSubmit, onToggleMic, onToggleVoice, onInterrupt, onReconnect, onEnd, onReset, onSnapshot,
  } = props;

  const [elapsed, setElapsed] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => setElapsed(Math.round((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partialUser, partialModel]);

  const overtime = limits ? elapsed > limits.maxSessionMinutes * 60 : false;
  const currentQuestion =
    partialModel || [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  const liveCaption = partialModel || partialUser;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
        {/* ---------- Header ---------- */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {targetRole || "Mock interview"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {connecting ? (
                <Badge variant="outline" className="gap-1.5 font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Connecting
                </Badge>
              ) : realtime ? (
                <Badge variant="outline" className="gap-1.5 border-primary/50 font-medium text-primary">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Realtime voice
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1.5 font-medium">
                  <WifiOff className="h-3 w-3" aria-hidden="true" />
                  Standard voice
                </Badge>
              )}
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  overtime ? "text-destructive" : "text-muted-foreground",
                )}
                aria-label={`Elapsed time ${formatClock(elapsed)}`}
              >
                {formatClock(elapsed)}
              </span>
              {limits && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  / {limits.maxSessionMinutes} min limit
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canReconnect && (
              <Button variant="outline" size="sm" onClick={onReconnect} disabled={connecting}>
                <Zap className="mr-2 h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Reconnect realtime</span>
                <span className="sm:hidden">Reconnect</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onEnd} disabled={ending}>
              {ending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Square className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              End &amp; score
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onReset} aria-label="Restart interview" className="min-h-11 min-w-11">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restart interview</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ---------- Stage + transcript ---------- */}
          <div className="flex min-w-0 flex-col gap-4">
            <section className="glass-card relative overflow-hidden px-5 py-8 sm:px-8 sm:py-10">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                aria-hidden="true"
              />
              <InterviewerOrb state={interviewerState} />

              {currentQuestion && (
                <div className="mx-auto mt-8 max-w-2xl text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Current question
                  </p>
                  <p className="mt-2 text-base leading-relaxed text-foreground sm:text-lg">
                    {currentQuestion}
                  </p>
                </div>
              )}

              {captionsOn && liveCaption && (
                <p
                  className="mx-auto mt-6 max-w-2xl rounded-lg bg-background/70 px-4 py-2 text-center text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {liveCaption}
                </p>
              )}
            </section>

            {/* Transcript */}
            <section className="glass-card flex min-h-[220px] flex-col p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Transcript
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCaptionsOn((c) => !c)}
                  aria-pressed={captionsOn}
                  className="h-8 text-xs"
                >
                  <Captions className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Captions {captionsOn ? "on" : "off"}
                </Button>
              </div>

              <div ref={scrollRef} className="max-h-[38vh] flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.length === 0 && !thinking && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Your interview transcript will appear here as you speak.
                  </p>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-3", msg.role === "user" && "justify-end")}>
                    {msg.role === "assistant" && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Bot className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60 text-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    {msg.role === "user" && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                ))}
                {thinking && (
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="flex items-center gap-1 rounded-xl bg-secondary/60 px-3.5 py-3">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-muted-foreground motion-safe:animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                      <span className="sr-only">Interviewer is thinking</span>
                    </div>
                  </div>
                )}
                {partialUser && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm italic text-muted-foreground">
                      {partialUser}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ---------- Control dock ---------- */}
            <div className="glass-card sticky bottom-4 flex flex-wrap items-center gap-2 p-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={micMuted ? "outline" : "default"}
                    size="icon"
                    onClick={onToggleMic}
                    aria-label={micLabel}
                    aria-pressed={!micMuted}
                    className="min-h-11 min-w-11 shrink-0"
                  >
                    {micMuted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{micLabel}</TooltipContent>
              </Tooltip>

              {realtime && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={onInterrupt}
                      disabled={interviewerState !== "speaking"}
                      aria-label="Interrupt the interviewer"
                      className="min-h-11 min-w-11 shrink-0"
                    >
                      <Hand className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Jump in — interrupt the interviewer</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onToggleVoice}
                    aria-label={voiceOn ? "Mute interviewer audio" : "Unmute interviewer audio"}
                    aria-pressed={voiceOn}
                    className="min-h-11 min-w-11 shrink-0"
                  >
                    {voiceOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{voiceOn ? "Interviewer audio on" : "Interviewer audio off"}</TooltipContent>
              </Tooltip>

              <label htmlFor="interview-answer" className="sr-only">
                Type your answer
              </label>
              <Input
                id="interview-answer"
                placeholder={realtime ? "Just talk — or type to add something" : "Type your answer…"}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                className="h-11 min-w-[8rem] flex-1 border-border bg-secondary/60"
              />
              <Button
                onClick={onSubmit}
                disabled={!input.trim()}
                aria-label="Send answer"
                className="min-h-11 min-w-11 shrink-0"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* ---------- Side rail ---------- */}
          <aside className="flex flex-col gap-4">
            <CameraMonitor active onSnapshot={onSnapshot} />

            {limits && (
              <div className="glass-card space-y-1.5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold capitalize text-foreground">{limits.tier} plan</p>
                  <Radio className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {limits.sessionsRemaining === null
                    ? "Unlimited interviews this month"
                    : `${limits.sessionsRemaining} of ${limits.sessionsPerMonth} interviews left this month`}
                </p>
                <p className="text-xs text-muted-foreground">Up to {limits.maxSessionMinutes} minutes per session</p>
              </div>
            )}

            <div className="glass-card space-y-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Session tips
              </p>
              {realtime && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Interrupt any time — just start talking and the interviewer will stop.
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Use STAR: Situation, Task, Action, Result.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Aim for 60–120 seconds per behavioural answer.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
