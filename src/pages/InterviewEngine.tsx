import { useState, useRef, useEffect } from "react";
import { Mic, Send, Loader2, RotateCcw, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";

type Msg = { role: "user" | "assistant"; content: string };

const INTERVIEW_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-coach`;

function InterviewEngineInner() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
  };

  const startInterview = async () => {
    setStarted(true);
    setIsLoading(true);
    try {
      await streamChat([{ role: "user", content: "Start the mock interview. Introduce yourself and ask the first question." }]);
    } catch (e: any) {
      toast.error(e.message || "Failed to start interview");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    try {
      await streamChat(newMessages);
    } catch (e: any) {
      toast.error(e.message || "Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  const resetInterview = () => {
    setMessages([]);
    setStarted(false);
    setInput("");
  };

  if (!started) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Interview Coach</h1>
          <p className="text-sm text-muted-foreground mt-1">AI-powered mock interview with real-time feedback</p>
        </div>
        <div className="glass-card p-8 flex flex-col items-center animate-slide-up">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Start a Mock Interview</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Practice with an AI interviewer tailored to your target role. Get real-time feedback on your answers.
          </p>
          <Input
            placeholder="Target role (e.g., Senior Frontend Engineer)"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="max-w-sm mb-4 bg-secondary border-border"
          />
          <Button onClick={startInterview} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Mic className="h-4 w-4 mr-2" />
            Begin Interview
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Interview Coach</h1>
          <p className="text-sm text-muted-foreground mt-1">{targetRole || "Mock Interview"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetInterview} className="border-border text-foreground">
          <RotateCcw className="h-4 w-4 mr-2" /> New Session
        </Button>
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
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "glass-card text-foreground"
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
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Type your answer..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          disabled={isLoading}
          className="bg-secondary border-border"
        />
        <Button onClick={sendMessage} disabled={isLoading || !input.trim()} className="bg-primary text-primary-foreground">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function InterviewEngine() {
  return (
    <ProGate
      feature="Interview Coach"
      description="Run unlimited AI mock interviews with Pro, or buy an interview prep pack."
      creditType="interview"
    >
      <InterviewEngineInner />
    </ProGate>
  );
}
