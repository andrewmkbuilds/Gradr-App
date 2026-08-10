import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { ProGate } from "@/components/ProGate";
import { CreditsBalance } from "@/components/CreditsBalance";
import { InterviewReportView, type InterviewReport } from "@/components/interview/InterviewReportView";
import { PracticePlanView, type PracticePlan } from "@/components/interview/PracticePlanView";
import { exportReportPdf, downloadBlob } from "@/lib/interview/reportPdf";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { usePremiumVoice } from "@/hooks/usePremiumVoice";
import { useRealtimeInterview } from "@/hooks/useRealtimeInterview";
import { InterviewSetup } from "@/components/interview/InterviewSetup";
import { PreflightCheck } from "@/components/interview/PreflightCheck";
import { InterviewStudio } from "@/components/interview/InterviewStudio";
import type { InterviewerState } from "@/components/interview/InterviewerOrb";
import { buildSessionDirective, type SessionContext } from "@/lib/interview/personas";

import type { IntegritySnapshot } from "@/lib/cv/faceMonitor";
import type { Json } from "@/integrations/supabase/types";


type Msg = { role: "user" | "assistant"; content: string };
type Engine = "realtime" | "fallback";


const INTERVIEW_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-coach`;

function InterviewEngineInner() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<"setup" | "preflight">("setup");
  const [sessionCtx, setSessionCtx] = useState<SessionContext | null>(null);
  const [voiceMode, setVoiceMode] = useState(true);
  const [engine, setEngine] = useState<Engine>("fallback");
  const [connecting, setConnecting] = useState(false);

  const [report, setReport] = useState<InterviewReport | null>(null);
  const [buildingReport, setBuildingReport] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const startedAt = useRef<number>(0);
  const integrityRef = useRef<IntegritySnapshot | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  const fallbackHandled = useRef(false);
  const navigate = useNavigate();

  const voice = useVoiceSession();
  const { speak, stopSpeaking, ttsSupported } = voice;
  const premium = usePremiumVoice();

  messagesRef.current = messages;

  const appendTurn = useCallback((turn: Msg) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      // Realtime transcripts can arrive as a continuation of the same speaker.
      if (last && last.role === turn.role && turn.content.startsWith(last.content)) {
        return prev.map((m, i) => (i === prev.length - 1 ? turn : m));
      }
      return [...prev, turn];
    });
  }, []);

  /** Switches from Gemini Live to the text coach + premium voice, keeping the transcript. */
  const degradeToFallback = useCallback((reason: string) => {
    if (fallbackHandled.current) return;
    fallbackHandled.current = true;
    setEngine("fallback");
    setConnecting(false);
    toast.info(`${reason} Continuing with standard voice — your transcript is preserved.`);
  }, []);

  const realtime = useRealtimeInterview({
    onTurn: appendTurn,
    onFallback: degradeToFallback,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, realtime.partialUser, realtime.partialModel]);

  const handleSnapshot = useCallback((s: IntegritySnapshot) => {
    integrityRef.current = s;
  }, []);

  const speakReply = useCallback(
    (text: string) => {
      if (!voiceMode || !text) return;
      if (realtime.limits?.premiumVoiceFallback) void premium.speak(text);
      else if (ttsSupported) speak(text);
    },
    [premium, realtime.limits, speak, ttsSupported, voiceMode],
  );

  const streamChat = async (allMessages: Msg[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Please sign in to use the interview coach");
      return;
    }
    const resp = await fetch(INTERVIEW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        messages: allMessages,
        targetRole,
        directive: sessionCtx ? buildSessionDirective(sessionCtx) : undefined,
      }),

    });

    if (resp.status === 401) { handleAiFunctionError({ status: 401 }, null); return; }
    if (resp.status === 429) {
      const body = await resp.json().catch(() => ({}));
      handleAiFunctionError({ status: 429 }, body);
      return;
    }
    if (resp.status === 402) { handleAiFunctionError({ status: 402 }, null); return; }
    if (!resp.ok || !resp.body) throw new Error("Stream failed");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") break;
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            assistantText += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
              }
              return [...prev, { role: "assistant", content: assistantText }];
            });
          }
        } catch { /* partial JSON */ }
      }
    }

    if (assistantText) speakReply(assistantText);
  };

  const startInterview = async (kickoff?: string) => {
    setStarted(true);
    setEngine("fallback");
    setReport(null);
    setPlan(null);
    setSessionId(null);
    setMessages([]);
    startedAt.current = Date.now();
    setIsLoading(true);
    try {
      await streamChat([
        {
          role: "user",
          content:
            kickoff ??
            "Start the mock interview. Introduce yourself and ask the first question.",
        },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Failed to start interview");
    } finally {
      setIsLoading(false);
    }
  };

  /** Opens the low-latency Gemini Live session, falling back to the text coach on any failure. */
  const startRealtime = async (ctx: SessionContext) => {
    fallbackHandled.current = false;
    setStarted(true);
    setReport(null);
    setPlan(null);
    setSessionId(null);
    setMessages([]);
    startedAt.current = Date.now();
    setConnecting(true);

    const result = await realtime.start({
      directive: buildSessionDirective(ctx),
      personaId: ctx.personaId,
      difficultyId: ctx.difficultyId,
    });
    setConnecting(false);

    if (result.ok) {
      fallbackHandled.current = false;
      setEngine("realtime");
      return;
    }
    // Entitlement blocks are informational; everything else silently degrades.
    if (result.code === "realtime_not_entitled" || result.code === "quota_exceeded") {
      toast.info(result.reason);
    }
    setEngine("fallback");
    await startInterview();
  };

  /** Reconnects realtime after a drop, replaying the transcript so context survives. */
  const retryRealtime = async () => {
    if (!sessionCtx) return;
    fallbackHandled.current = false;
    setConnecting(true);
    const result = await realtime.start({
      directive: buildSessionDirective(sessionCtx),
      personaId: sessionCtx.personaId,
      difficultyId: sessionCtx.difficultyId,
      resumeTranscript: messagesRef.current,
    });
    setConnecting(false);
    if (result.ok) {
      setEngine("realtime");
      toast.success("Realtime voice reconnected — picking up where you left off.");
    } else {
      toast.error(result.reason);
    }
  };

  /** Replays the same role question set with the report's next steps applied as coaching focus. */
  const rerunWithImprovements = () => {
    if (!report) return;
    const questions = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content.replace(/\s+/g, " ").trim())
      .slice(0, 12);
    const focus = [...(report.improvements ?? []), ...(report.nextSteps ?? [])].slice(0, 8);
    const kickoff = [
      `Re-run the same mock interview for the role: ${targetRole || "the same role"}.`,
      "Ask the SAME question set, in the same order, as this previous session:",
      questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      "",
      "The candidate is retrying to apply this coaching feedback:",
      focus.map((f) => `- ${f}`).join("\n"),
      "",
      "Before each question, add one short reminder (max 15 words) of the improvement to apply. Then ask the question. Start now with your introduction and the first question.",
    ].join("\n");
    setDurationSec(0);
    realtime.stop();
    toast.success("Re-running the same question set with your improvements applied.");
    void startInterview(kickoff);
  };

  const submitAnswer = async (text: string) => {
    const answer = text.trim();
    if (!answer || isLoading) return;

    if (engine === "realtime" && realtime.isLive) {
      appendTurn({ role: "user", content: answer });
      realtime.sendText(answer);
      setInput("");
      return;
    }

    stopSpeaking();
    premium.stop();
    const newMessages: Msg[] = [...messages, { role: "user", content: answer }];
    setMessages(newMessages);
    setInput("");
    voice.setTranscript("");
    setIsLoading(true);
    try {
      await streamChat(newMessages);
    } catch (e: any) {
      toast.error(e.message || "Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMic = () => {
    if (engine === "realtime") {
      realtime.setMuted(!realtime.muted);
      return;
    }
    if (voice.listening) {
      const finalText = voice.stopListening();
      void submitAnswer(finalText);
    } else {
      stopSpeaking();
      premium.stop();
      voice.startListening();
    }
  };

  const endAndScore = async () => {
    if (messages.length < 2) {
      toast.info("Answer at least one question before ending the session.");
      return;
    }
    stopSpeaking();
    premium.stop();
    realtime.stop();
    if (voice.listening) voice.stopListening();
    setBuildingReport(true);
    const elapsed = Math.round((Date.now() - startedAt.current) / 1000);
    try {
      const { data, error } = await supabase.functions.invoke("interview-report", {
        body: {
          messages,
          targetRole,
          integrity: integrityRef.current,
          durationSec: elapsed,
        },
      });
      if (error) throw error;
      if (!data?.report) throw new Error("No report returned");
      const newReport = data.report as InterviewReport;
      setReport(newReport);
      setDurationSec(elapsed);

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: saved } = await supabase
          .from("interview_sessions")
          .insert({
            user_id: userData.user.id,
            target_role: targetRole || null,
            duration_sec: elapsed,
            overall_score: Math.round(newReport.overallScore),
            report: newReport as unknown as Json,
            integrity: (integrityRef.current ?? null) as unknown as Json,
            transcript: messages as unknown as Json,
          })
          .select("id")
          .maybeSingle();
        if (saved?.id) setSessionId(saved.id);
      }
    } catch {
      toast.error("Couldn't generate your scorecard. Please try again.");
    } finally {
      setBuildingReport(false);
    }
  };

  const generatePlan = async () => {
    if (!report) return;
    setPlanLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("practice-plan", {
        body: { report, targetRole },
      });
      if (error) throw error;
      if (!data?.plan) throw new Error("No plan returned");
      const newPlan = data.plan as PracticePlan;
      setPlan(newPlan);
      if (sessionId) {
        await supabase
          .from("interview_sessions")
          .update({
            practice_plan: newPlan as unknown as Json,
            focus_areas: newPlan.focusAreas ?? [],
          })
          .eq("id", sessionId);
      }
    } catch {
      toast.error("Couldn't build your practice plan. Please try again.");
    } finally {
      setPlanLoading(false);
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const { blob } = await exportReportPdf({ report, targetRole, durationSec, plan, sessionId });
      downloadBlob(blob, "gradr-interview-scorecard.pdf");
      toast.success("Scorecard saved to your account and downloaded.");
    } catch {
      toast.error("Couldn't export your scorecard. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const resetInterview = () => {
    stopSpeaking();
    premium.stop();
    realtime.stop();
    if (voice.listening) voice.stopListening();
    setMessages([]);
    setStarted(false);
    setStage("setup");
    setEngine("fallback");

    setInput("");
    setReport(null);
    setPlan(null);
    setSessionId(null);
    integrityRef.current = null;
  };


  if (report) {
    return (
      <div className="max-w-3xl mx-auto py-2 space-y-6">
        <InterviewReportView
          report={report}
          integrity={integrityRef.current}
          durationSec={durationSec}
          onRestart={resetInterview}
          onRerun={rerunWithImprovements}
          onGeneratePlan={generatePlan}
          planLoading={planLoading}
          hasPlan={!!plan}
          onExportPdf={exportPdf}
          exporting={exporting}
          onViewHistory={() => navigate("/interview/history")}
        />
        {plan && <PracticePlanView plan={plan} />}
      </div>
    );
  }


  if (!started) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Mock Interview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Realtime voice interview with live presence coaching and a scored report at the end
          </p>
        </div>
        <CreditsBalance only="interview" compact />

        {stage === "setup" ? (
          <InterviewSetup
            initial={sessionCtx ?? undefined}
            onContinue={(ctx) => {
              setSessionCtx(ctx);
              setTargetRole(ctx.targetRole ?? "");
              setStage("preflight");
            }}
          />
        ) : (
          <PreflightCheck
            onCancel={() => setStage("setup")}
            onReady={() => (sessionCtx ? void startRealtime(sessionCtx) : void startInterview())}
          />
        )}

        {!voice.supported && (
          <p className="text-xs text-muted-foreground">
            Speech input isn't supported in this browser — you can still type your answers.
          </p>
        )}
      </div>
    );
  }


  const liveRealtime = engine === "realtime" && realtime.isLive;

  return (
    <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Mock Interview</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-muted-foreground">{targetRole || "Mock Interview"}</p>
              {liveRealtime ? (
                <Badge variant="outline" className="border-primary/50 text-primary gap-1">
                  <Radio className="h-3 w-3 animate-pulse" /> Realtime voice
                </Badge>
              ) : connecting ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Connecting
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">Standard voice</Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {liveRealtime && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => realtime.interrupt()}
                disabled={!realtime.speaking}
                title="Interrupt the interviewer"
              >
                <Hand className="h-4 w-4 mr-2" />
                Jump in
              </Button>
            )}
            {!liveRealtime && realtime.limits?.realtimeVoice && (
              <Button variant="outline" size="sm" onClick={retryRealtime} disabled={connecting}>
                <Zap className="h-4 w-4 mr-2" />
                Reconnect realtime
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                stopSpeaking();
                premium.stop();
                setVoiceMode((v) => !v);
              }}
            >
              {voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={endAndScore} disabled={buildingReport}>
              {buildingReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
              End &amp; score
            </Button>
            <Button variant="outline" size="sm" onClick={resetInterview}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto space-y-4 pr-2 mb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "glass-card text-foreground"
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === "user" && (
                <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
          {realtime.partialModel && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="max-w-[80%] rounded-xl px-4 py-3 text-sm glass-card text-muted-foreground italic">
                {realtime.partialModel}
              </div>
            </div>
          )}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="glass-card rounded-xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          {(voice.listening || realtime.partialUser) && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-xl px-4 py-3 text-sm border border-primary/40 bg-primary/5 text-muted-foreground">
                {realtime.partialUser || voice.transcript || "Listening…"}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {(voice.supported || liveRealtime) && (
            <Button
              variant={liveRealtime ? (realtime.muted ? "outline" : "default") : voice.listening ? "default" : "outline"}
              onClick={toggleMic}
              disabled={isLoading && !liveRealtime}
              className="shrink-0"
              title={liveRealtime ? (realtime.muted ? "Unmute" : "Mute") : "Push to talk"}
            >
              {liveRealtime ? (
                realtime.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />
              ) : voice.listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}
          <Input
            placeholder={
              liveRealtime
                ? "Just talk — or type to add something"
                : voice.listening
                  ? "Listening… tap the mic to submit"
                  : "Type your answer..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitAnswer(input)}
            disabled={(isLoading || voice.listening) && !liveRealtime}
            className="bg-secondary border-border"
          />
          <Button onClick={() => submitAnswer(input)} disabled={(isLoading && !liveRealtime) || !input.trim()} className="bg-primary text-primary-foreground">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <CameraMonitor active={started} onSnapshot={handleSnapshot} />
        {realtime.limits && (
          <div className="glass-card p-4 text-xs text-muted-foreground space-y-1">
            <p className="text-sm font-semibold text-foreground capitalize">{realtime.limits.tier} plan</p>
            <p>
              {realtime.limits.sessionsRemaining === null
                ? "Unlimited interviews this month"
                : `${realtime.limits.sessionsRemaining} of ${realtime.limits.sessionsPerMonth} interviews left this month`}
            </p>
            <p>Up to {realtime.limits.maxSessionMinutes} minutes per session</p>
          </div>
        )}
        <div className="glass-card p-4 text-xs text-muted-foreground space-y-2">
          <p className="text-sm font-semibold text-foreground">Session tips</p>
          {liveRealtime && <p>You can interrupt the interviewer any time — just start talking.</p>}
          <p>Use the STAR structure: Situation, Task, Action, Result.</p>
          <p>Speak for 60–120 seconds per behavioural answer.</p>
          <p>Hit “End &amp; score” whenever you're ready for your report.</p>
        </div>
      </div>
    </div>
  );
}

export default function InterviewEngine() {
  return (
    <ProGate
      feature="AI Mock Interview"
      description="Run unlimited AI mock interviews with Pro, or buy an interview prep pack."
      creditType="interview"
    >
      <InterviewEngineInner />
    </ProGate>
  );
}
