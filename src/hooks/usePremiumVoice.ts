import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fish Audio premium voice playback used as the fallback voice when the
 * Gemini Live realtime engine is unavailable. Falls back again to the browser's
 * built-in speech synthesis if the TTS function fails.
 */
export function usePremiumVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [available, setAvailable] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speakBrowser = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const clean = text.replace(/[*_#`>]/g, "").trim();
      if (!clean) return;
      stop();

      if (!available) {
        speakBrowser(clean);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("no session");

        const res = await fetch(
          "/api/public/interview-voice",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ text: clean }),
          },
        );
        if (!res.ok) throw new Error(`tts ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setSpeaking(false);
          if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
          }
        };
        setSpeaking(true);
        await audio.play();
      } catch {
        setAvailable(false);
        speakBrowser(clean);
      }
    },
    [available, speakBrowser, stop],
  );

  return { speak, stop, speaking, premiumAvailable: available };
}
