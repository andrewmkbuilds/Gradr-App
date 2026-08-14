import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionErrorOverlay } from "@/components/interview/ConnectionErrorOverlay";
import { VOICE_ERROR_CODES, voiceErrorCopy } from "@/lib/interview/voiceErrors";

const FORBIDDEN = [
  /free tier/i,
  /unusual activity/i,
  /vpn/i,
  /proxy/i,
  /multiple .*accounts/i,
  /elevenlabs/i,
  /upgrade to a paid subscription/i,
];

describe("interviewer voice error state", () => {
  it("never leaks provider wording for any code", () => {
    for (const code of VOICE_ERROR_CODES) {
      const { title, message } = voiceErrorCopy(code);
      for (const pattern of FORBIDDEN) {
        expect(`${title} ${message}`).not.toMatch(pattern);
      }
    }
  });

  it("offers retry and continue-by-typing", () => {
    render(
      <ConnectionErrorOverlay open code="VOICE_CONNECTION_FAILED" onRetry={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText("Interviewer voice temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry voice/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue by typing/i })).toBeInTheDocument();
  });
});
