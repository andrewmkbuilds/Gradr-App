/**
 * Blocked camera/mic must never dead-end the interview.
 *
 * When `getUserMedia` is refused, the preflight has to (a) say plainly that the
 * devices are blocked and (b) offer a typed session instead — a disabled
 * "Start interview" button on its own strands the candidate.
 *
 * The companion case is the plan-gated one: when the tier can't use spoken
 * turns the studio must show an upgrade prompt that still points at text mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PreflightCheck } from "@/components/interview/PreflightCheck";
import { InterviewStudio } from "@/components/interview/InterviewStudio";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

function denyMedia() {
  const err = new Error("Permission denied");
  err.name = "NotAllowedError";
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(err) },
  });
}

describe("interview with camera/mic denied", () => {
  beforeEach(denyMedia);
  afterEach(() => vi.restoreAllMocks());

  it("explains the block and starts a text session instead", async () => {
    const onTextOnly = vi.fn();
    const onReady = vi.fn();
    render(<PreflightCheck onReady={onReady} onTextOnly={onTextOnly} />);

    const error = await screen.findByTestId("preflight-error", {}, { timeout: 5000 });
    expect(error.textContent).toMatch(/blocked/i);

    // Voice start stays unavailable...
    expect(screen.getByRole("button", { name: /waiting for camera & mic/i })).toBeDisabled();

    // ...but the typed session is one click away.
    const fallback = screen.getByTestId("preflight-start-text");
    await userEvent.click(fallback);
    await waitFor(() => expect(onTextOnly).toHaveBeenCalledTimes(1));
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("free-tier voice prompt", () => {
  it("offers an upgrade without hiding the text path", () => {
    render(
      <MemoryRouter>
        <InterviewStudio
          targetRole="Product Manager"
          messages={[{ role: "assistant", content: "Walk me through a launch." }]}
          partialUser=""
          partialModel=""
          interviewerState="idle"
          input=""
          setInput={() => {}}
          onSend={() => {}}
          onEnd={() => {}}
          sending={false}
          micMuted={false}
          onToggleMic={() => {}}
          realtime={false}
          voiceAvailable={false}
          voiceOn={false}
          onToggleVoice={() => {}}
          limits={null}
          elapsedSec={0}
        />
      </MemoryRouter>,
    );

    const prompt = screen.getByTestId("voice-upgrade-prompt");
    expect(prompt.textContent).toMatch(/Pro feature/i);
    expect(prompt.textContent).toMatch(/text mode/i);
    expect(screen.getByRole("link", { name: /upgrade for voice/i })).toHaveAttribute("href", "/pricing");
  });
});
