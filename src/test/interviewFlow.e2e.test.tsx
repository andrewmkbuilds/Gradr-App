/**
 * End-to-end coverage of one interview lifecycle:
 *   schedule  ->  setup (with validation)  ->  debrief  ->  transcript export
 *
 * The network edges (Lovable Cloud client, scheduling hook) are stubbed; every
 * other step runs the real component, the real validation and the real export
 * pipeline, so a regression in any link of the chain fails here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { SessionContext } from "@/lib/interview/personas";

/* ----------------------------- stubs ----------------------------- */

const scheduleMock = vi.fn(async () => true);
const importCalendar = vi.fn(async () => 0);

vi.mock("@/hooks/useScheduledInterviews", () => ({
  useScheduledInterviews: () => ({
    items: [],
    loading: false,
    busy: false,
    calendarError: null,
    importCalendar,
    scheduleMock,
    cancel: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// The setup form hydrates from the user's profile, latest resume and plan.
vi.mock("@/integrations/supabase/client", () => {
  const rows: Record<string, unknown> = {
    profiles: { target_job_title: null },
    resumes: { file_name: "andrew-resume.pdf", parsed_text: "Led a payments migration." },
    subscribers: { subscribed: true, subscription_tier: "pro" },
  };
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      order: self,
      limit: self,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
    });
    return chain;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
      from: (table: string) => builder(table),
    },
  };
});

/* --------------------------- imports (post-mock) --------------------------- */

import { InterviewScheduler } from "@/components/interview/InterviewScheduler";
import { InterviewSetup } from "@/components/interview/InterviewSetup";
import { SessionDebrief } from "@/components/interview/SessionDebrief";

const TRANSCRIPT = [
  { role: "assistant" as const, content: "Walk me through a project where you changed the outcome with data." },
  { role: "user" as const, content: "I rebuilt our checkout funnel and lifted conversion by 12%." },
];

const REPORT = {
  overallScore: 82,
  communication: 84,
  technicalDepth: 78,
  structure: 80,
  confidence: 76,
  nextSteps: ["Draft two more impact stories."],
  summary: "Strong, specific answers with clear impact framing.",
  strengths: ["Quantified outcomes"],
  improvements: ["Tighten the setup of each story"],
  recommendedQuestions: ["Tell me about a time a launch slipped."],
};

let downloads: { filename: string; size: number }[] = [];
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  downloads = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
  // downloadBlob() builds an <a download> and clicks it; jsdom won't navigate.
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ filename: this.download, size: 1 });
  });
});

afterEach(() => {
  clickSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

/* -------------------------------- the flow -------------------------------- */

describe("interview lifecycle: schedule -> setup -> debrief -> export", () => {
  it("schedules a mock interview for the target role", async () => {
    const user = userEvent.setup();
    wrap(<InterviewScheduler defaultRole="Senior Frontend Engineer" />);

    const title = await screen.findByDisplayValue(/Mock interview — Senior Frontend Engineer/);
    expect(title).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /schedule/i }));

    await waitFor(() => expect(scheduleMock).toHaveBeenCalledTimes(1));
    const payload = (scheduleMock.mock.calls[0] as unknown as [
      { title: string; startsAt: string; durationMin: number; targetRole?: string },
    ])[0];
    expect(payload.targetRole).toBe("Senior Frontend Engineer");
    expect(Number.isNaN(Date.parse(payload.startsAt))).toBe(false);
    expect(payload.durationMin).toBeGreaterThan(0);
  });

  it("blocks setup on an invalid optional role, then continues once corrected", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn<(ctx: SessionContext) => void>();
    wrap(<InterviewSetup onContinue={onContinue} />);

    // Resume auto-load resolves before we interact.
    await screen.findByText(/andrew-resume\.pdf/);

    const role = screen.getByLabelText(/target role/i);
    await user.type(role, "S");
    await user.tab();

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(role).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: /continue to device check/i }));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText(/fix the highlighted fields/i)).toBeInTheDocument();

    // Correct it and the error clears without a page reload.
    await user.clear(role);
    await user.type(role, "Senior Frontend Engineer");
    await waitFor(() => expect(screen.queryByText(/at least 2 characters/i)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /continue to device check/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));

    const ctx = onContinue.mock.calls[0]![0];
    expect(ctx.targetRole).toBe("Senior Frontend Engineer");
    expect(ctx.resumeText).toContain("payments migration");
    expect("company" in ctx).toBe(false);
    expect("jobDescription" in ctx).toBe(false);
  });

  it("surfaces a non-blocking advisory when optional grounding is skipped", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn<(ctx: SessionContext) => void>();
    wrap(<InterviewSetup onContinue={onContinue} />);
    await screen.findByText(/andrew-resume\.pdf/);

    await user.click(screen.getByLabelText(/target role/i));
    await user.tab();
    expect(await screen.findByText(/questions will stay generic/i)).toBeInTheDocument();

    // Advisory only — the session still starts.
    await user.click(screen.getByRole("button", { name: /continue to device check/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(onContinue.mock.calls[0]![0].targetRole).toBeUndefined();
  });

  it("renders the debrief and exports the transcript as PDF and DOC", async () => {
    const user = userEvent.setup();
    wrap(
      <SessionDebrief
        report={REPORT}
        messages={TRANSCRIPT}
        targetRole="Senior Frontend Engineer"
        durationSec={742}
      />,
    );

    const debrief = screen.getByRole("region", { name: /session debrief/i });
    expect(within(debrief).getByText(REPORT.summary)).toBeInTheDocument();
    expect(within(debrief).getByText(/quantified outcomes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /pdf/i }));
    await user.click(screen.getByRole("button", { name: /word|doc/i }));

    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(downloads[0]!.filename).toMatch(/^gradr-interview-transcript-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(downloads[1]!.filename).toMatch(/^gradr-interview-transcript-\d{4}-\d{2}-\d{2}\.doc$/);
  });

  it("keeps the exported transcript faithful to the session", async () => {
    const { downloadTranscriptDoc } = await import("@/lib/interview/transcriptExport");
    const blobs: Blob[] = [];
    const original = global.Blob;
    class Capturing extends original {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        blobs.push(this);
        (this as unknown as { __text: string }).__text = (parts ?? []).join("");
      }
    }
    vi.stubGlobal("Blob", Capturing);

    downloadTranscriptDoc({
      messages: TRANSCRIPT,
      targetRole: "Senior Frontend Engineer",
      durationSec: 742,
    });

    const text = (blobs[0] as unknown as { __text: string }).__text;
    expect(text).toContain("Senior Frontend Engineer");
    expect(text).toContain("Duration: 12m 22s");
    expect(text).toContain("Interviewer");
    expect(text).toContain("lifted conversion by 12%");
  });
});
