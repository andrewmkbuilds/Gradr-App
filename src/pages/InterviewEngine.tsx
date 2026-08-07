import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Send, Loader2, RotateCcw, User, Bot, Volume2, VolumeX, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { ProGate } from "@/components/ProGate";
import { CreditsBalance } from "@/components/CreditsBalance";
import { CameraMonitor } from "@/components/interview/CameraMonitor";
import { InterviewReportView, type InterviewReport } from "@/components/interview/InterviewReportView";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import type { IntegritySnapshot } from "@/lib/cv/faceMonitor";

type Msg = { role: "user" | "assistant"; content: string };

const INTERVIEW_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-coach`;

function InterviewEngineInner() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [started, setStarted] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [buildingReport, setBuildingReport] = useState(false);
  const startedAt = useRef<number>(0);
  const integrityRef = useRef<IntegritySnapshot | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceSession();
  const { speak, stopSpeaking, ttsSupported } = voice;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSnapshot = useCallback((s: IntegritySnapshot) => {
    integrityRef.current = s;
  }, []);

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
      body: JSON.stringify({ messages: allMessages, targetRole }),
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

    if (voiceMode && ttsSupported && assistantText) speak(assistantText);
  };

  const startInterview = async () => {
    setStarted(true);
    setReport(null);
    startedAt.current = Date.now();
    setIsLoading(true);
    try {
      await streamChat([{ role: "user", content: "Start the mock interview. Introduce yourself and ask the first question." }]);
    } catch (e: any) {
      toast.error(e.message || "Failed to start interview");
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnswer = async (text: string) => {
    const answer = text.trim();
    if (!answer || isLoading) return;
    stopSpeaking();
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
    if (voice.listening) {
      const finalText = voice.stopListening();
      void submitAnswer(finalText);
    } else {
      stopSpeaking();
      voice.startListening();
    }
  };

  const endAndScore = async () => {
    if (messages.length < 2) {
      toast.info("Answer at least one question before ending the session.");
      return;
    }
    stopSpeaking();
    if (voice.listening) voice.stopListening();
    setBuildingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("interview-report", {
        body: {
          messages,
          targetRole,
          integrity: integrityRef.current,
          durationSec: Math.round((Date.now() - startedAt.current) / 1000),
        },
      });
      if (error) throw error;
      if (!data?.report) throw new Error("No report returned");
      setReport(data.report as InterviewReport);
    } catch {
      toast.error("Couldn't generate your scorecard. Please try again.");
    } finally {
      setBuildingReport(false);
    }
  };

  const resetInterview = () => {
    stopSpeaking();
    if (voice.listening) voice.stopListening();
    setMessages([]);
    setStarted(false);
    setInput("");
    setReport(null);
    integrityRef.current = null;
  };

  if (report) {
    return (
      <div className="max-w-3xl mx-auto py-2">
        <InterviewReportView
          report={report}
          integrity={integrityRef.current}
          durationSec={Math.round((Date.now() - startedAt.current) / 1000)}
          onRestart={resetInterview}
        />
      </div>
    );
  }

  if (!started) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Mock Interview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Voice interview with live presence coaching and a scored report at the end
          </p>
        </div>
        <CreditsBalance only="interview" compact />
        <div className="glass-card p-8 flex flex-col items-center animate-slide-up">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Start a Mock Interview</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Speak your answers, get instant follow-ups, and finish with a scorecard on communication,
            technical depth, structure and confidence.
          </p>
          <Input
            placeholder="Target role (e.g., Senior Frontend Engineer)"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="max-w-sm mb-4 bg-secondary border-border"
          />
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={voiceMode ? "default" : "outline"}
              size="sm"
              onClick={() => setVoiceMode((v) => !v)}
            >
              {voiceMode ? <Volume2 className="h-4 w-4 mr-2" /> : <VolumeX className="h-4 w-4 mr-2" />}
              Voice {voiceMode ? "on" : "off"}
            </Button>
          </div>
          <Button onClick={startInterview} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Mic className="h-4 w-4 mr-2" />
            Begin Interview
          </Button>
          {!voice.supported && (
            <p className="text-xs text-muted-foreground mt-3">
              Speech input isn't supported in this browser — you can still type your answers.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Mock Interview</h1>
            <p className="text-sm text-muted-foreground mt-1">{targetRole || "Mock Interview"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => (voice.speaking ? stopSpeaking() : setVoiceMode((v) => !v))}>
              {voice.speaking ? <VolumeX className="h-4 w-4" /> : voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={endAndScore} disabled={buildingReport}>
              {buildingReport ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
              End & score
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
          {voice.listening && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-xl px-4 py-3 text-sm border border-primary/40 bg-primary/5 text-muted-foreground">
                {voice.transcript || "Listening…"}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {voice.supported && (
            <Button
              variant={voice.listening ? "default" : "outline"}
              onClick={toggleMic}
              disabled={isLoading}
              className="shrink-0"
            >
              {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Input
            placeholder={voice.listening ? "Listening… tap the mic to submit" : "Type your answer..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitAnswer(input)}
            disabled={isLoading || voice.listening}
            className="bg-secondary border-border"
          />
          <Button onClick={() => submitAnswer(input)} disabled={isLoading || !input.trim()} className="bg-primary text-primary-foreground">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <CameraMonitor active={started} onSnapshot={handleSnapshot} />
        <div className="glass-card p-4 text-xs text-muted-foreground space-y-2">
          <p className="text-sm font-semibold text-foreground">Session tips</p>
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
