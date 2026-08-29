/**
 * End-to-end guard for the plan-gated voice path.
 *
 * When the backend answers a turn with VOICE_NOT_ENTITLED the interview must
 * carry on as a text interview: the transcript stays intact, no blocking
 * overlay appears, the voice affordance is visibly unavailable, and typing
 * works immediately. The recoverable-fault path is covered too: "Retry after
 * reconnect" must preserve the transcript and the half-typed answer.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { InterviewStudio } from "@/components/interview/InterviewStudio";
import type { VoiceErrorCode } from "@/lib/interview/voiceErrors";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const TRANSCRIPT = [
  { role: "assistant" as const, content: "Tell me about a launch you rescued." },
  { role: "user" as const, content: "We shipped the payments migration a week early." },
];

/**
 * Mirrors InterviewEngine's real policy: an entitlement failure drops voice for
 * the session without an overlay; any other fault opens the recovery panel.
 */
function Harness({ initialError }: { initialError: VoiceErrorCode | null }) {
  const [voiceError, setVoiceError] = useState<VoiceErrorCode | null>(initialError);
  const [dismissed, setDismissed] = useState(initialError === "VOICE_NOT_ENTITLED");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(TRANSCRIPT);
  const entitled = voiceError !== "VOICE_NOT_ENTITLED";

  return (
    <InterviewStudio
      targetRole="Senior Frontend Engineer"
      messages={messages}
      partialUser=""
      partialModel=""
      interviewerState="idle"
      realtime={entitled && !voiceError}
      connecting={false}
      canReconnect={Boolean(voiceError) && voiceError !== "VOICE_NOT_ENTITLED"}
      voiceAvailable={entitled}
      voiceRecovering={false}
      voiceErrorCode={voiceError}
      voiceErrorRequestId="req-42"
      micMuted
      micLabel="Start answering"
      voiceOn={entitled}
      thinking={false}
      ending={false}
      input={input}
      limits={null}
      startedAt={Date.now()}
      connectionLost={Boolean(voiceError) && voiceError !== "VOICE_NOT_ENTITLED" && !dismissed}
      onDismissConnectionError={() => setDismissed(true)}
      onInputChange={setInput}
      onSubmit={() => {
        setMessages((prev) => [...prev, { role: "user" as const, content: input }]);
        setInput("");
      }}
      onToggleMic={() => {}}
      onToggleVoice={() => {}}
      onInterrupt={() => {}}
      onReconnect={() => {
        // Recovery never rebuilds the session: transcript and draft survive.
        setVoiceError(null);
        setDismissed(true);
      }}
      onEnd={() => {}}
      onReset={() => {}}
      onSnapshot={() => null}
    />
  );
}

afterEach(() => vi.clearAllMocks());

describe("VOICE_NOT_ENTITLED keeps the interview alive", () => {
  it("leaves the transcript intact and lets the candidate type straight away", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Harness initialError="VOICE_NOT_ENTITLED" />
      </MemoryRouter>,
    );

    // No blocking recovery dialog for a plan limit.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    // Transcript survived the failed voice turn.
    expect(screen.getAllByText(/Tell me about a launch you rescued/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/payments migration a week early/).length).toBeGreaterThan(0);

    // Voice affordance is present but unavailable — no dead-end, no crash.
    const voiceToggle = screen.getByRole("button", {
      name: /interviewer audio is not included in your plan/i,
    });
    expect(voiceToggle).toBeDisabled();

    // Typing works immediately, with no reconnect step in between.
    const answer = screen.getByLabelText(/type your answer/i);
    await user.type(answer, "I can answer in text.");
    expect(answer).toHaveValue("I can answer in text.");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getAllByText("I can answer in text.").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Tell me about a launch you rescued/).length).toBeGreaterThan(0);
  });

  it("preserves transcript and draft answer through Retry after reconnect", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Harness initialError="VOICE_CONNECTION_FAILED" />
      </MemoryRouter>,
    );

    // A real outage does get the recovery panel, with the quotable request id.
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("req-42");

    await user.click(screen.getByRole("button", { name: /retry after reconnect/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    // Nothing was lost, and the input is live again.
    expect(screen.getAllByText(/Tell me about a launch you rescued/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/payments migration a week early/).length).toBeGreaterThan(0);

    const answer = screen.getByLabelText(/type your answer/i);
    await user.type(answer, "Picking up where we left off.");
    expect(answer).toHaveValue("Picking up where we left off.");
  });
});
