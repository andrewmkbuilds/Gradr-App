import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoiceErrorPanel } from "@/components/interview/VoiceErrorPanel";
import { voiceReasonCopy, toVoiceProviderReason } from "@/lib/interview/voiceErrors";

describe("voice provider reasons", () => {
  it("only accepts known enumerated reasons", () => {
    expect(toVoiceProviderReason("PROVIDER_UNUSUAL_ACTIVITY")).toBe("PROVIDER_UNUSUAL_ACTIVITY");
    expect(toVoiceProviderReason("detected_unusual_activity")).toBeNull();
    expect(toVoiceProviderReason(undefined)).toBeNull();
  });

  it("explains an entitlement hold as recoverable by reconnecting", () => {
    const copy = voiceReasonCopy("PROVIDER_UNUSUAL_ACTIVITY");
    expect(copy?.reconnectHelps).toBe(true);
    expect(copy?.detail).toMatch(/entitlement/i);
  });

  it("marks a missing credential as not recoverable by the candidate", () => {
    expect(voiceReasonCopy("PROVIDER_CREDENTIAL_MISSING")?.reconnectHelps).toBe(false);
  });
});

describe("VoiceErrorPanel", () => {
  it("shows the entitlement explanation, exact codes and a reconnect retry", () => {
    render(
      <VoiceErrorPanel
        open
        code="VOICE_CONFIGURATION_ERROR"
        reason="PROVIDER_UNUSUAL_ACTIVITY"
        onRetryAfterReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Voice entitlement temporarily suspended/i)).toBeInTheDocument();
    expect(screen.getByText(/VOICE_CONFIGURATION_ERROR · PROVIDER_UNUSUAL_ACTIVITY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry after reconnect/i })).toBeInTheDocument();
  });

  it("hides retry when reconnecting cannot help", () => {
    render(
      <VoiceErrorPanel
        open
        code="VOICE_CONFIGURATION_ERROR"
        reason="PROVIDER_CREDENTIAL_MISSING"
        onRetryAfterReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /retry after reconnect/i })).toBeNull();
    expect(screen.getByRole("button", { name: /continue by typing/i })).toBeInTheDocument();
  });
});
