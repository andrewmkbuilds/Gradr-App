import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DEFAULT_FLAGS,
  isSandboxAvailable,
  onSandboxFlagsChange,
  sandboxFlags,
  setSandboxFlags,
  type MediaMode,
  type SandboxFlags,
} from "@/lib/qa/sandbox/flags";
import { clearInbox, inboxMessages, onInboxChange, type CapturedEmail } from "@/lib/qa/sandbox/inbox";
import {
  CREDIT_PACKS,
  applySimulatedPack,
  cancelSimulatedPlan,
  onSimulatorChange,
  resetSimulator,
  resumeSimulatedPlan,
  setSimulatedPlan,
  simulatorState,
  type SimPlan,
  type SimulatorState,
} from "@/lib/qa/sandbox/simulator";
import { clearOauthLog, oauthLog, qaAccount, setQaAccount } from "@/lib/qa/sandbox/oauth";

/**
 * QA sandbox console.
 *
 * Switches the local fixture modes on and off, shows the captured mailbox, the
 * simulated billing state and the mocked OAuth hop log. Dev/preview only — the
 * route is not mounted on the production hosts.
 */
const MEDIA_MODES: { value: MediaMode; label: string }[] = [
  { value: "off", label: "Real hardware" },
  { value: "granted", label: "Synthetic camera + mic" },
  { value: "denied", label: "Permission denied" },
  { value: "no-device", label: "No device found" },
];

const PLANS: SimPlan[] = ["free", "starter", "pro", "advanced"];

export default function QaSandbox() {
  const [flags, setFlags] = useState<SandboxFlags>(() => sandboxFlags());
  const [mail, setMail] = useState<CapturedEmail[]>(() => inboxMessages());
  const [billing, setBilling] = useState<SimulatorState>(() => simulatorState());
  const [log, setLog] = useState(() => oauthLog());
  const [account, setAccount] = useState(() => qaAccount() ?? { email: "", password: "" });

  useEffect(() => onSandboxFlagsChange(setFlags), []);
  useEffect(() => onInboxChange(setMail), []);
  useEffect(() => onSimulatorChange(setBilling), []);

  if (!isSandboxAvailable()) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-h3 font-display">QA sandbox unavailable</h1>
        <p className="mt-4 text-body text-muted-foreground">
          The sandbox only runs on development and preview hosts.
        </p>
      </main>
    );
  }

  const toggle = (key: keyof SandboxFlags) => (value: boolean) => setFlags(setSandboxFlags({ [key]: value } as Partial<SandboxFlags>));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 section-stack-lg">
      <Helmet>
        <title>QA sandbox — Gradr</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="section-stack">
        <Badge variant="outline">Development only</Badge>
        <h1 className="text-h2 font-display">QA sandbox</h1>
        <p className="text-body text-muted-foreground">
          Replaces third-party dependencies with saved fixtures so full journeys can be tested
          without external credentials. Nothing here writes to the database.
        </p>
      </header>

      <Card className="p-6 section-stack">
        <h2 className="text-h5 font-display">Fixture modes</h2>
        <ToggleRow label="Job search fixtures" hint="search-jobs, board scraper and match scoring return saved listings." checked={flags.jobs} onChange={toggle("jobs")} />
        <ToggleRow label="Resume ATS fixture" hint="analyze-resume streams a saved report with real progress stages." checked={flags.resume} onChange={toggle("resume")} />
        <ToggleRow label="Local e-mail capture" hint="Transactional sends and password resets land in the inbox below." checked={flags.email} onChange={toggle("email")} />
        <ToggleRow label="Mocked OAuth providers" hint="Google/Apple/Microsoft sign-in bounces through a deterministic mock." checked={flags.oauth} onChange={toggle("oauth")} />
        <ToggleRow label="Payment simulator" hint="Plan, credits and purchases come from the local simulator instead of Paddle." checked={flags.payments} onChange={toggle("payments")} />

        <div className="section-stack pt-2">
          <p className="text-body-sm font-medium">Camera &amp; microphone</p>
          <div className="flex flex-wrap gap-2">
            {MEDIA_MODES.map((m) => (
              <Button
                key={m.value}
                size="sm"
                variant={flags.media === m.value ? "default" : "outline"}
                onClick={() => setFlags(setSandboxFlags({ media: m.value }))}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setFlags(setSandboxFlags(DEFAULT_FLAGS))}>
            Turn everything off
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/jobs">Open job search</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/resume">Open resume engine</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/interview">Open interview coach</Link>
          </Button>
        </div>
      </Card>

      <Card className="p-6 section-stack">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-h5 font-display">Captured mailbox ({mail.length})</h2>
          <Button variant="outline" size="sm" onClick={() => { clearInbox(); toast.success("Inbox cleared"); }}>
            Clear
          </Button>
        </div>
        {mail.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No messages yet. With capture on, request a reset from{" "}
            <Link className="underline" to="/forgot-password">/forgot-password</Link>.
          </p>
        ) : (
          <ul className="section-stack">
            {mail.map((m) => (
              <li key={m.id} className="rounded-control border border-border p-3 section-stack">
                <p className="text-body-sm font-medium">{m.subject}</p>
                <p className="text-caption text-muted-foreground">
                  to {m.to} · {new Date(m.capturedAt).toLocaleTimeString()} · {m.template ?? "ad-hoc"}
                </p>
                {m.links.map((href) => (
                  <a key={href} href={href} className="block break-all text-caption text-primary underline">
                    {href}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6 section-stack">
        <h2 className="text-h5 font-display">Payment simulator</h2>
        <p className="text-body-sm text-muted-foreground">
          Plan <strong>{billing.plan}</strong> · {billing.status}
          {billing.cancelAtPeriodEnd ? " (cancels at period end)" : ""} · renews{" "}
          {new Date(billing.currentPeriodEnd).toLocaleDateString()} · {billing.applicationCredits} application /{" "}
          {billing.interviewCredits} interview credits
        </p>
        <div className="flex flex-wrap gap-2">
          {PLANS.map((p) => (
            <Button key={p} size="sm" variant={billing.plan === p ? "default" : "outline"} onClick={() => setBilling(setSimulatedPlan(p))}>
              {p}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setBilling(cancelSimulatedPlan())}>Cancel at period end</Button>
          <Button size="sm" variant="outline" onClick={() => setBilling(resumeSimulatedPlan())}>Resume</Button>
          {Object.entries(CREDIT_PACKS).map(([key, pack]) => (
            <Button key={key} size="sm" variant="outline" onClick={() => setBilling(applySimulatedPack(key))}>
              Buy {pack.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setBilling(resetSimulator())}>Reset</Button>
        </div>
        {billing.purchases.length > 0 && (
          <ul className="section-stack text-caption text-muted-foreground">
            {billing.purchases.slice(0, 5).map((p) => (
              <li key={p.id}>{p.pack_label} · {p.credits_granted} credits · {p.id}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6 section-stack">
        <h2 className="text-h5 font-display">Mocked OAuth</h2>
        <p className="text-body-sm text-muted-foreground">
          Optional QA account used to create a real session at the end of the mocked redirect.
          Leave it empty to verify the redirect chain only.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="section-stack">
            <Label htmlFor="qa-oauth-email">QA account e-mail</Label>
            <Input id="qa-oauth-email" type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
          </div>
          <div className="section-stack">
            <Label htmlFor="qa-oauth-password">QA account password</Label>
            <Input id="qa-oauth-password" type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setQaAccount(account.email && account.password ? account : null); toast.success("QA account saved for this browser"); }}>
            Save QA account
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setQaAccount(null); setAccount({ email: "", password: "" }); }}>
            Forget
          </Button>
          <Button size="sm" variant="outline" onClick={() => { clearOauthLog(); setLog([]); }}>Clear log</Button>
          <Button size="sm" variant="outline" onClick={() => setLog(oauthLog())}>Refresh log</Button>
        </div>
        {log.length > 0 && (
          <ul className="section-stack text-caption text-muted-foreground">
            {log.slice(0, 8).map((entry) => (
              <li key={`${entry.at}-${entry.stage}`}>
                {new Date(entry.at).toLocaleTimeString()} · {entry.provider} · {entry.stage} · {entry.detail}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `qa-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="flex items-start justify-between gap-4 rounded-control border border-border p-3">
      <div className="section-stack">
        <Label htmlFor={id} className="text-body-sm font-medium">{label}</Label>
        <p className="text-caption text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
