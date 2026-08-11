import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
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
import { SessionDebrief } from "@/components/interview/SessionDebrief";
import type { InterviewerState } from "@/components/interview/InterviewerOrb";
import { buildSessionDirective, type SessionContext } from "@/lib/interview/personas";

import type { IntegritySnapshot } from "@/lib/cv/faceMonitor";
import type { Json } from "@/integrations/supabase/types";
import { trackJourney } from "@/lib/telemetry/journey";



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
  const [connectionErrorDismissed, setConnectionErrorDismissed] = useState(false);
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
        environment: getPaddleEnvironment(),
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
    trackJourney("interview_started", { engine: "fallback", has_role: Boolean(targetRole) });

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
    trackJourney("interview_started", { engine: "realtime", has_role: Boolean(targetRole) });

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
      trackJourney("interview_completed", {
        engine,
        duration_sec: elapsed,
        turns: messages.length,
      });
      trackJourney("interview_report_generated", {
        overall_score: Math.round(newReport.overallScore),
        duration_sec: elapsed,
      });


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
        <SessionDebrief
          report={report}
          messages={messages}
          targetRole={targetRole}
          durationSec={durationSec}
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
  // Realtime streaming dropped mid-session: surface a retry overlay unless dismissed.
  const connectionLost =
    engine === "realtime" && !realtime.isLive && !connecting && !connectionErrorDismissed;

  const interviewerState: InterviewerState = connecting
    ? "connecting"
    : realtime.speaking || premium.speaking || voice.speaking
      ? "speaking"
      : isLoading
        ? "thinking"
        : liveRealtime && !realtime.muted
          ? "listening"
          : voice.listening
            ? "listening"
            : "idle";

  const micMuted = liveRealtime ? realtime.muted : !voice.listening;
  const micLabel = liveRealtime
    ? realtime.muted
      ? "Unmute your microphone"
      : "Mute your microphone"
    : voice.listening
      ? "Stop recording and submit your answer"
      : "Start recording your answer";

  return (
    <InterviewStudio
      targetRole={targetRole}
      messages={messages}
      partialUser={realtime.partialUser || (voice.listening ? voice.transcript : "")}
      partialModel={realtime.partialModel}
      interviewerState={interviewerState}
      realtime={liveRealtime}
      connecting={connecting}
      canReconnect={!liveRealtime && !!realtime.limits?.realtimeVoice}
      micMuted={micMuted}
      micLabel={micLabel}
      voiceOn={voiceMode}
      thinking={isLoading && messages[messages.length - 1]?.role !== "assistant"}
      ending={buildingReport}
      input={input}
      limits={realtime.limits}
      startedAt={startedAt.current}
      connectionLost={connectionLost}
      onDismissConnectionError={() => setConnectionErrorDismissed(true)}
      onInputChange={setInput}
      onSubmit={() => void submitAnswer(input)}
      onToggleMic={toggleMic}
      onToggleVoice={() => {
        stopSpeaking();
        premium.stop();
        setVoiceMode((v) => !v);
      }}
      onInterrupt={() => realtime.interrupt()}
      onReconnect={() => {
        setConnectionErrorDismissed(false);
        void retryRealtime();
      }}
      onEnd={() => void endAndScore()}
      onReset={resetInterview}
      onSnapshot={handleSnapshot}
    />
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
