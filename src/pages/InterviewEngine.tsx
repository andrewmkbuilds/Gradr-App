import { useState, useRef, useEffect, useCallback } from "react";
import { track } from "@/lib/telemetry/events";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_FUNCTIONS_BASE } from "@/lib/supabaseEndpoints";
import { getPaddleEnvironment } from "@/lib/paddle";
import { toast } from "sonner";
import { useAiStream } from "@/hooks/useAiStream";
import { GenerationStream } from "@/components/ai/GenerationStream";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { Progressive } from "@/components/app/Progressive";
import { InterviewCoachDemo } from "@/components/demos/EngineDemos";
import { ProGate } from "@/components/ProGate";
import { CreditsBalance } from "@/components/CreditsBalance";
import { InterviewReportView, type InterviewReport } from "@/components/interview/InterviewReportView";
import { PracticePlanView, type PracticePlan } from "@/components/interview/PracticePlanView";
import { exportReportPdf, downloadBlob } from "@/lib/interview/reportPdf";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import type { VoiceErrorCode } from "@/lib/interview/voiceErrors";
import { useInterviewVoice } from "@/hooks/useInterviewVoice";
import { useVoiceHealthWatch } from "@/hooks/useVoiceHealthWatch";
import { reconnectVoiceSession } from "@/lib/interview/voiceStatus";
import { useInterviewMetrics } from "@/hooks/useInterviewMetrics";
import { InterviewSetup } from "@/components/interview/InterviewSetup";
import { PreflightCheck } from "@/components/interview/PreflightCheck";
import { InterviewStudio } from "@/components/interview/InterviewStudio";
import { InterviewScheduler } from "@/components/interview/InterviewScheduler";
import { VoiceUsageMeter } from "@/components/interview/VoiceUsageMeter";

import { SessionDebrief } from "@/components/interview/SessionDebrief";
import type { InterviewerState } from "@/components/interview/InterviewerOrb";
import { buildSessionDirective, type SessionContext } from "@/lib/interview/personas";
import { voiceProfileFor } from "@/lib/interview/voiceProfiles";

import type { IntegritySnapshot } from "@/lib/cv/faceMonitor";
import type { Json } from "@/integrations/supabase/types";
import { trackJourney } from "@/lib/telemetry/journey";

type Msg = { role: "user" | "assistant"; content: string };

interface SessionLimits {
  tier: string;
  studioVoice: boolean;
  sessionsPerMonth: number | null;
  sessionsRemaining: number | null;
  maxSessionMinutes: number;
}

const INTERVIEW_URL = `${SUPABASE_FUNCTIONS_BASE}/interview-coach`;

/** How long the candidate can go quiet before their answer is submitted. */
const ANSWER_SILENCE_MS = 1900;

function InterviewEngineInner() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<"setup" | "preflight">("setup");
  const [sessionCtx, setSessionCtx] = useState<SessionContext | null>(null);
  const [voiceMode, setVoiceMode] = useState(true);
  const [limits, setLimits] = useState<SessionLimits | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [voiceError, setVoiceError] = useState<VoiceErrorCode | null>(null);
  const [connectionErrorDismissed, setConnectionErrorDismissed] = useState(false);
  /**
   * Subscription-aware voice availability. Mirrors `studioVoiceAllowedRef` in
   * state so the studio can grey out the voice affordances the instant the
   * backend says this tier can't speak — without touching the interview.
   */
  const [voiceEntitled, setVoiceEntitled] = useState(false);

  /** The interviewer's current turn, revealed only as fast as it is spoken. */
  const [spoken, setSpoken] = useState("");

  const [report, setReport] = useState<InterviewReport | null>(null);
  const [buildingReport, setBuildingReport] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const planStream = useAiStream<{ plan: PracticePlan }>({
    fn: "practice-plan",
    initialLabel: "Reading your scorecard",
  });
  const [exporting, setExporting] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const startedAt = useRef<number>(0);
  const integrityRef = useRef<IntegritySnapshot | null>(null);

  const messagesRef = useRef<Msg[]>([]);
  const spokenRef = useRef("");
  const generatedTurnRef = useRef("");
  const studioVoiceAllowedRef = useRef(false);
  const voiceModeRef = useRef(voiceMode);
  const handsFreeRef = useRef(true);
  const silenceTimer = useRef<number | null>(null);
  const navigate = useNavigate();

  const voice = useVoiceSession();
  const { stopSpeaking } = voice;
  const metrics = useInterviewMetrics();

  messagesRef.current = messages;
  voiceModeRef.current = voiceMode;

  const personaId = sessionCtx?.personaId ?? "hiring-manager";
  const profile = voiceProfileFor(personaId);

  const submitRef = useRef<(text: string) => void>(() => {});
  const listenRef = useRef<() => void>(() => {});

  // ---- Interviewer voice ---------------------------------------------------
  const interviewer = useInterviewVoice({
    personaId,
    enabled: voiceMode && studioVoiceAllowedRef.current,
    onCaption: (text) => {
      // Live captions: only what the interviewer has actually spoken so far.
      spokenRef.current = text;
      setSpoken(text);
    },
    onTurnComplete: () => {
      const finalText = spokenRef.current.trim();
      spokenRef.current = "";
      setSpoken("");
      if (finalText) {
        setMessages((prev) => [...prev, { role: "assistant", content: finalText }]);
        metrics.markModelResponse();
      }
      // Natural hand-over: a short beat, then the interviewer starts listening.
      if (handsFreeRef.current && voiceModeRef.current && voice.supported) {
        window.setTimeout(() => listenRef.current(), 420);
      }
    },
    onVoiceError: (code) => {
      // Preserve both the generated turn and already-spoken caption for exact retry.
      setVoiceError(code);
      if (code === "VOICE_NOT_ENTITLED") {
        // Plan-level, not an outage: drop to text for the rest of the session
        // silently. No overlay, no lost turn — typing stays live immediately.
        studioVoiceAllowedRef.current = false;
        setVoiceEntitled(false);
        setConnectionErrorDismissed(true);
        return;
      }
      setConnectionErrorDismissed(false);
    },
  });


  /**
   * Server-side voice faults can heal on their own (key rotated, quota reset).
   * Watch quietly in the background and re-arm voice in place — the candidate
   * keeps typing and the transcript is never touched.
   */
  const serverVoiceFault =
    voiceError === "VOICE_CONFIGURATION_ERROR" ||
    voiceError === "VOICE_RATE_LIMITED" ||
    voiceError === "VOICE_CONNECTION_FAILED" ||
    voiceError === "VOICE_UNAVAILABLE";

  const { checking: voiceRecovering } = useVoiceHealthWatch({
    active: serverVoiceFault,
    onRecovered: () => {
      studioVoiceAllowedRef.current = true;
      setVoiceEntitled(true);
      setVoiceError(null);
      setConnectionErrorDismissed(true);
      interviewerRef.current?.clearError();
      toast.success("Interviewer voice is back — it'll speak the next question.");
    },
  });

  const interviewerRef = useRef(interviewer);
  interviewerRef.current = interviewer;

  // ---- Turn-taking: submit once the candidate has clearly stopped ----------
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      window.clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!voice.supported || voice.listening) return;
    interviewerRef.current.stop();
    metrics.markUserTurnStart();
    voice.startListening();
  }, [metrics, voice]);
  listenRef.current = startListening;

  useEffect(() => {
    if (!voice.listening || !voice.transcript.trim()) return;
    clearSilenceTimer();
    silenceTimer.current = window.setTimeout(() => {
      const finalText = voice.stopListening();
      if (finalText.trim()) submitRef.current(finalText);
    }, ANSWER_SILENCE_MS);
    return clearSilenceTimer;
  }, [voice.transcript, voice.listening, voice.stopListening, clearSilenceTimer]);

  useEffect(() => () => clearSilenceTimer(), [clearSilenceTimer]);

  const handleSnapshot = useCallback((s: IntegritySnapshot) => {
    integrityRef.current = s;
  }, []);

  // ---- Reasoning stream ----------------------------------------------------
  const streamChat = async (allMessages: Msg[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error("Please sign in to use the interview coach");
      return;
    }

    spokenRef.current = "";
    generatedTurnRef.current = "";
    setSpoken("");
    interviewerRef.current.beginTurn();

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
          // Speech and captions both flow from here — nothing is revealed early.
          if (content) {
            generatedTurnRef.current += content;
            interviewerRef.current.pushDelta(content);
          }
        } catch { /* partial JSON */ }
      }
    }

    interviewerRef.current.endTurn();
  };

  const runTurn = async (nextMessages: Msg[]) => {
    setIsLoading(true);
    setStreamFailed(false);
    try {
      await streamChat(nextMessages);
    } catch (e) {
      setStreamFailed(true);
      setConnectionErrorDismissed(false);
      interviewerRef.current.stop();
      toast.error(e instanceof Error ? e.message : "The interviewer lost connection.");
    } finally {
      setIsLoading(false);
    }
  };

  /** Reads plan limits so the studio can gate length, personas and voice. */
  const loadLimits = async (ctx: SessionContext) => {
    studioVoiceAllowedRef.current = false;
    setVoiceEntitled(false);
    const { data, error } = await supabase.functions.invoke("interview-session", {
      body: {
        environment: getPaddleEnvironment(),
        personaId: ctx.personaId,
        difficultyId: ctx.difficultyId,
      },
    });
    if (error) {
      type LimitsPayload = { limits?: Omit<SessionLimits, "sessionsRemaining">; reason?: unknown };
      let payload: LimitsPayload | null = null;
      try {
        const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
        payload = (await ctx?.json?.()) as LimitsPayload | null;
      } catch { /* not json */ }
      if (payload?.limits) {
        setLimits({ ...payload.limits, sessionsRemaining: null });
        studioVoiceAllowedRef.current = Boolean(payload.limits.studioVoice);
        setVoiceEntitled(Boolean(payload.limits.studioVoice));
      }
      return payload?.reason ? String(payload.reason) : null;
    }
    if (data?.limits) {
      setLimits({ ...data.limits, sessionsRemaining: null });
      studioVoiceAllowedRef.current = Boolean(data.limits.studioVoice);
      setVoiceEntitled(Boolean(data.limits.studioVoice));
    }
    return null;
  };

  const startSession = async (ctx: SessionContext, kickoff?: string) => {
    setStarted(true);
    setReport(null);
    setPlan(null);
    setSessionId(null);
    setMessages([]);
    setSpoken("");
    spokenRef.current = "";
    startedAt.current = Date.now();
    setConnecting(true);

    const blocked = await loadLimits(ctx);
    setConnecting(false);
    if (blocked) toast.info(blocked);

    trackJourney("interview_started", { engine: "elevenlabs", has_role: Boolean(ctx.targetRole) });
    track("mock_interview_started", {
      persona: ctx.personaId,
      difficulty: ctx.difficultyId,
      has_target_role: Boolean(ctx.targetRole),
      has_job_description: Boolean(ctx.jobDescription),
    });
    void metrics.begin({ provider: "elevenlabs", targetRole: ctx.targetRole ?? null });

    await runTurn([
      {
        role: "user",
        content:
          kickoff ??
          "Start the interview now. Introduce yourself in one short line, then ask your first question.",
      },
    ]);
  };

  const rerunWithImprovements = () => {
    if (!report || !sessionCtx) return;
    const questions = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content.replace(/\s+/g, " ").trim())
      .slice(0, 12);
    const focus = [...(report.improvements ?? []), ...(report.nextSteps ?? [])].slice(0, 8);
    const kickoff = [
      `Re-run the same interview for the role: ${targetRole || "the same role"}.`,
      "Cover the SAME topics, in the same order, as this previous session:",
      questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      "",
      "The candidate is retrying to apply this coaching feedback:",
      focus.map((f) => `- ${f}`).join("\n"),
      "",
      "Start now with a one-line reintroduction and your first question.",
    ].join("\n");
    setDurationSec(0);
    interviewer.stop();
    toast.success("Re-running the same question set with your improvements applied.");
    void startSession(sessionCtx, kickoff);
  };

  const submitAnswer = useCallback(
    async (text: string) => {
      const answer = text.trim();
      if (!answer || isLoading) return;

      clearSilenceTimer();
      interviewerRef.current.stop();
      stopSpeaking();

      const nextMessages: Msg[] = [...messagesRef.current, { role: "user", content: answer }];
      setMessages(nextMessages);
      setInput("");
      voice.setTranscript("");
      await runTurn(nextMessages);
    },
    // runTurn/streamChat read the latest state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearSilenceTimer, isLoading, stopSpeaking, voice.setTranscript],
  );
  submitRef.current = (text: string) => void submitAnswer(text);

  /** Mic button: barge-in + push-to-talk on top of the hands-free loop. */
  const toggleMic = () => {
    if (voice.listening) {
      handsFreeRef.current = false;
      clearSilenceTimer();
      const finalText = voice.stopListening();
      if (finalText.trim()) void submitAnswer(finalText);
      return;
    }
    handsFreeRef.current = true;
    interviewer.stop();
    stopSpeaking();
    startListening();
  };

  const endAndScore = async () => {
    if (messages.length < 2) {
      toast.info("Answer at least one question before ending the session.");
      return;
    }
    handsFreeRef.current = false;
    clearSilenceTimer();
    interviewer.stop();
    stopSpeaking();
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
        engine: "elevenlabs",
        duration_sec: elapsed,
        turns: messages.length,
      });
      trackJourney("interview_report_generated", {
        overall_score: Math.round(newReport.overallScore),
        duration_sec: elapsed,
      });
      void metrics.finish("completed");
      track("mock_interview_completed", {
        duration_sec: elapsed,
        turns: messages.length,
        overall_score: Math.round(newReport.overallScore),
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
        if (saved?.id) {
          setSessionId(saved.id);
          void metrics.linkSession(saved.id);
          void supabase.functions.invoke("send-notification", {
            body: {
              template: "interview_followup",
              input: { role: targetRole || undefined, link: `/interview/history` },
              idempotencyKey: `interview_followup:${saved.id}`,
            },
          });
        }
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
      const streamed = await planStream.start({ report, targetRole });
      if (!streamed?.plan) return;

      const newPlan = streamed.plan;
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
    handsFreeRef.current = true;
    clearSilenceTimer();
    interviewer.stop();
    stopSpeaking();
    if (voice.listening) voice.stopListening();
    setMessages([]);
    setSpoken("");
    spokenRef.current = "";
    setStarted(false);
    setStage("setup");
    setInput("");
    setReport(null);
    setPlan(null);
    setSessionId(null);
    setStreamFailed(false);
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
        {planStream.status !== "done" && (
          <GenerationStream
            status={planStream.status}
            progress={planStream.progress}
            label={planStream.label}
            error={planStream.error}
            title="7-day practice plan"
            onCancel={planStream.cancel}
            onRetry={planStream.retry}
          />
        )}
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
          <h1 className="type-h1 text-foreground tracking-tight">AI Mock Interview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A live, spoken interview with a studio-voiced interviewer, presence coaching and a scored report at the end
          </p>
        </div>
        <CreditsBalance only="interview" compact />
        <VoiceUsageMeter compact />

        {stage === "setup" && (
          <Progressive minHeight={380}>
            <InterviewCoachDemo />
          </Progressive>
        )}

        {stage === "setup" ? (
          <InterviewSetup
            {...(sessionCtx ? { initial: sessionCtx } : {})}
            onContinue={(ctx) => {
              setSessionCtx(ctx);
              setTargetRole(ctx.targetRole ?? "");
              setStage("preflight");
            }}
          />
        ) : (
          <PreflightCheck
            onCancel={() => setStage("setup")}
            onReady={() => sessionCtx && void startSession(sessionCtx)}
            onTextOnly={() => {
              // Camera/mic blocked: drop to typed turns rather than stranding
              // the candidate on the device check.
              setVoiceMode(false);
              voiceModeRef.current = false;
              if (sessionCtx) void startSession(sessionCtx);
            }}
          />
        )}

        {stage === "setup" && (
          <InterviewScheduler
            {...(targetRole || sessionCtx?.targetRole
              ? { defaultRole: targetRole || sessionCtx?.targetRole }
              : {})}
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

  const interviewerState: InterviewerState = connecting
    ? "connecting"
    : interviewer.speaking
      ? "speaking"
      : isLoading
        ? "thinking"
        : voice.listening
          ? "listening"
          : "idle";

  const micLabel = voice.listening
    ? "Stop recording and send your answer"
    : "Start answering";

  return (
    <InterviewStudio
      targetRole={targetRole}
      messages={messages}
      partialUser={voice.listening ? voice.transcript : ""}
      partialModel={spoken}
      interviewerState={interviewerState}
      realtime={voiceMode && voiceEntitled && !voiceError}
      connecting={connecting}
      canReconnect={streamFailed || (Boolean(voiceError) && voiceError !== "VOICE_NOT_ENTITLED")}
      voiceAvailable={voiceEntitled}
      voiceRecovering={voiceRecovering}
      voiceErrorRequestId={interviewer.errorRequestId}

      micMuted={!voice.listening}
      micLabel={micLabel}
      voiceOn={voiceMode && voiceEntitled}
      thinking={isLoading && !interviewer.speaking}
      ending={buildingReport}
      input={input}
      limits={
        limits
          ? {
              tier: limits.tier,
              sessionsPerMonth: limits.sessionsPerMonth,
              sessionsRemaining: limits.sessionsRemaining,
              maxSessionMinutes: limits.maxSessionMinutes,
            }
          : null
      }
      startedAt={startedAt.current}
      connectionLost={
        (streamFailed || (Boolean(voiceError) && voiceError !== "VOICE_NOT_ENTITLED")) &&
        !connectionErrorDismissed
      }
      voiceErrorCode={voiceError}
      voiceErrorReason={interviewer.errorReason}


      onDismissConnectionError={() => setConnectionErrorDismissed(true)}
      onInputChange={setInput}
      onSubmit={() => void submitAnswer(input)}
      onToggleMic={toggleMic}
      onToggleVoice={() => {
        if (!voiceEntitled) return;
        interviewer.stop();
        stopSpeaking();
        setVoiceMode((v) => !v);
      }}
      onInterrupt={() => {
        interviewer.stop();
        metrics.markInterruption();
        startListening();
      }}
      onReconnect={() => {
        // "Retry after reconnect": re-establish the app session first so a stale
        // token is never mistaken for a provider outage, then replay the same
        // turn through the same voice provider — never a silent fallback.
        setConnecting(true);
        void reconnectVoiceSession()
          .catch(() => null)
          .finally(() => {
            setConnecting(false);
            setConnectionErrorDismissed(false);
            setStreamFailed(false);
            setVoiceError(null);
            interviewer.clearError();
            const generatedTurn = generatedTurnRef.current.trim();
            if (generatedTurn) {
              spokenRef.current = "";
              setSpoken("");
              interviewer.retryTurn(generatedTurn);
            } else {
              void runTurn(messagesRef.current);
            }
          });
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
