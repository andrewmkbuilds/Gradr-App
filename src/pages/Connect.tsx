import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  LifeBuoy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/Badge";
import { Seo } from "@/components/Seo";
import { PageHeader } from "@/components/app/PageHeader";
import { toast } from "sonner";
import { MCP_TOOLS } from "@/lib/mcp/catalog";
import {
  MCP_APP_NAME as APP_NAME,
  MCP_APP_SLUG as APP_SLUG,
  MCP_CLIENTS,
  buildInstructionsFile,
  getMcpClient,
  type McpClientId,
} from "@/lib/mcp/clients";
import { verifyMcpEndpoint, type McpVerifyResult } from "@/lib/mcp/verify";

/**
 * Resolve the public MCP endpoint from the browser-reachable backend URL, so it
 * always matches whatever deployment the page is being viewed on.
 */
function resolveMcpUrl(): string {
  const configured = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!configured) return "";
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return "";
  }
  const authority = configured.match(/^https?:\/\/([^/?#]*)/i)?.[1];
  const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(authority ?? "");
  if (
    !authority ||
    authority.includes("@") ||
    configured.includes("?") ||
    configured.includes("#") ||
    (url.protocol === "http:" && !loopback)
  ) {
    return "";
  }
  const legacyCloud = url.hostname.endsWith(".lovable.cloud") && !url.hostname.startsWith("c--");
  const dataPlane = legacyCloud
    ? `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`
    : url.toString().replace(/\/+$/, "");
  return `${dataPlane}/functions/v1/mcp`;
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code tabIndex={0} className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {value}
      </code>
      <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => void copy()}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function ClientSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function Connect() {
  const mcpUrl = useMemo(resolveMcpUrl, []);
  const [clientId, setClientId] = useState<McpClientId>("chatgpt");
  const client = getMcpClient(clientId);
  const deepLink = mcpUrl ? client.deepLink(mcpUrl) : null;

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<McpVerifyResult | null>(null);

  const runVerify = useCallback(async () => {
    setVerifying(true);
    try {
      const result = await verifyMcpEndpoint(mcpUrl);
      setVerifyResult(result);
      if (result.status === "ok") toast.success("Connection endpoint is reachable");
      else toast.error("Connection check found a problem");
    } finally {
      setVerifying(false);
    }
  }, [mcpUrl]);

  const downloadInstructions = useCallback(() => {
    const contents = buildInstructionsFile(client, mcpUrl);
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchorEl = document.createElement("a");
    anchorEl.href = href;
    anchorEl.download = `${APP_SLUG}-connect-${client.id}.txt`;
    document.body.appendChild(anchorEl);
    anchorEl.click();
    anchorEl.remove();
    URL.revokeObjectURL(href);
    toast.success("Instructions downloaded");
  }, [client, mcpUrl]);


  const claudeLink = useMemo(
    () =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
        APP_NAME,
      )}&connectorUrl=${encodeURIComponent(mcpUrl)}`,
    [mcpUrl],
  );

  const claudeCodeCommand = `claude mcp add --scope user --transport http ${APP_SLUG} '${mcpUrl.replace(
    /'/g,
    "'\\''",
  )}'`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Seo
        title="Connect an AI assistant"
        description="Connect ChatGPT, Claude or another AI assistant to your Gradr account so it can work with your resumes, matches and applications."
        path="/connect"
      />

      <PageHeader
        eyebrow="Agent integrations"
        icon={<Bot className="h-3.5 w-3.5" />}
        title="Connect an AI assistant"
        description="Link ChatGPT, Claude or any assistant that supports remote connectors to your Gradr account. It signs in as you, so it only ever sees your own resumes, job matches and applications."
      />

      <Card className="space-y-3 p-6">
        <h2 className="text-sm font-semibold text-foreground">Your connection URL</h2>
        <p className="text-sm text-muted-foreground">
          Paste this into your assistant when it asks for a server or connector URL. It isn't a
          secret — you'll still be asked to sign in and approve access.
        </p>
        {mcpUrl ? (
          <CopyField value={mcpUrl} label="Connection URL" />
        ) : (
          <p className="text-sm text-destructive">
            The connection URL isn't available in this environment.
          </p>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Verify connection
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check that the connector endpoint is live and correctly protected before you paste it
            into an assistant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void runVerify()} disabled={!mcpUrl || verifying} className="gap-2">
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {verifying ? "Checking…" : "Verify connection"}
          </Button>
          {verifyResult && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              {verifyResult.status === "ok" ? (
                <Check className="h-4 w-4 text-primary" />
              ) : verifyResult.status === "unreachable" ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              {verifyResult.message}
            </span>
          )}
        </div>
        {verifyResult?.status === "ok" && (
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium text-foreground">
              {MCP_TOOLS.length} tools are reachable through this connection
            </p>
            {verifyResult.authorizationServer && (
              <p className="mt-1 text-sm text-muted-foreground">
                Sign-in is handled by your {APP_NAME} account.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Tools available to your account
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Once connected, your assistant can use these {MCP_TOOLS.length} tools — always as you,
            never on anyone else's data.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name} className="flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{tool.title}</span>
                <code className="font-mono text-caption text-muted-foreground">{tool.name}</code>
                <Badge variant={tool.readOnly ? "neutral" : "warning"}>
                  {tool.readOnly ? "Read-only" : "Can make changes"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{tool.description}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Set up your client</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick your assistant to open its connector page with the URL prefilled, or download the
            steps to follow later.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose your assistant">
          {MCP_CLIENTS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={entry.id === clientId ? "primary" : "outline"}
              aria-pressed={entry.id === clientId}
              onClick={() => setClientId(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {deepLink && (
            <Button asChild className="gap-2">
              <a href={deepLink} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="h-4 w-4" />
                {client.deepLinkLabel}
              </a>
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={downloadInstructions} disabled={!mcpUrl}>
            <Download className="h-4 w-4" />
            Download connector instructions
          </Button>
        </div>
        {client.command && mcpUrl && <CopyField value={client.command(mcpUrl)} label="Install command" />}
      </Card>

      <Card className="space-y-6 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LifeBuoy className="h-4 w-4 text-muted-foreground" />
            Troubleshooting
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The three things that go wrong most often, and the quickest fix for each client.
          </p>
        </div>

        <ClientSection title="Sign-in fails, loops, or the assistant says “unauthorized”">
          <Steps
            items={[
              <>
                ChatGPT: open Settings → Connectors, delete {APP_NAME}, then add it again — an
                expired approval can't be repaired in place.
              </>,
              <>Claude: open Connectors, disconnect {APP_NAME}, then reconnect and approve access.</>,
              <>
                Claude Code: run{" "}
                <code className="font-mono text-foreground">claude mcp remove {APP_SLUG}</code>, add
                it again, then run <code className="font-mono text-foreground">/mcp</code> and sign in.
              </>,
              <>
                Cursor / VS Code: toggle the server off and on in MCP settings to restart the sign-in
                flow. Make sure you're signed in to {APP_NAME} in the same browser.
              </>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Blocked request, network error, or CORS failure">
          <Steps
            items={[
              <>
                Run <span className="font-medium text-foreground">Verify connection</span> above — if
                that fails too, the endpoint is being blocked before it's reached.
              </>,
              <>
                Turn off VPNs, corporate proxies and request-blocking browser extensions, then retry.
              </>,
              <>
                Desktop clients (Claude Code, Cursor, VS Code) need direct HTTPS access to the
                connection URL — allow it in any firewall rules.
              </>,
              <>Never paste the URL into an <code className="font-mono text-foreground">http://</code> field; the endpoint is HTTPS-only.</>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Wrong or outdated URL (404, “server not found”)">
          <Steps
            items={[
              <>Copy the connection URL from the top of this page again — it's the source of truth.</>,
              <>
                It must end in <code className="font-mono text-foreground">/functions/v1/mcp</code>{" "}
                with no trailing slash or extra path.
              </>,
              <>
                ChatGPT and Claude can't edit an existing connector's URL — delete the connector and
                add it again.
              </>,
              <>
                Claude Code / Cursor / VS Code: remove the server entry and re-add it with the URL
                above.
              </>,
            ]}
          />
        </ClientSection>
      </Card>

      <Card className="space-y-6 p-6">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Connect your assistant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the assistant you use and follow the steps.
          </p>
        </div>

        <ClientSection title="ChatGPT">
          <Steps
            items={[
              <>
                Open{" "}
                <a
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                  href="https://chatgpt.com/#settings/Connectors/Advanced"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  ChatGPT settings <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and turn on Developer mode, reading the risk notice shown there. If you can't see
                it, ask a ChatGPT admin to enable it for your workspace.
              </>,
              <>
                Open the{" "}
                <a
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                  href="https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  new connector dialog <ExternalLink className="h-3 w-3" />
                </a>
                .
              </>,
              <>
                Enter <span className="font-medium text-foreground">{APP_NAME}</span> as the name
                and paste the connection URL above.
              </>,
              <>
                Review the details, tick “I understand and want to continue” (ChatGPT shows this for
                every custom connector), then click Create.
              </>,
              <>Enable {APP_NAME} from the chat composer, then ask ChatGPT to use it.</>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Claude">
          <Steps
            items={[
              <>
                Open the{" "}
                <a
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
                  href={claudeLink}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  prefilled connector dialog <ExternalLink className="h-3 w-3" />
                </a>{" "}
                — the name and URL are already filled in.
              </>,
              <>Review the details and click Add.</>,
              <>
                If the dialog doesn't open, go to Claude's Connectors page, choose “Add custom
                connector”, name it {APP_NAME} and paste the connection URL above.
              </>,
              <>Enable the connector from the chat composer, then ask Claude to use it.</>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Claude Code" icon={<Terminal className="h-4 w-4 text-muted-foreground" />}>
          <Steps
            items={[
              <>Run this in a terminal:</>,
              <>
                Start Claude Code and run <code className="font-mono text-foreground">/mcp</code> to
                confirm {APP_NAME} is connected and sign in when prompted.
              </>,
              <>Ask Claude Code to use {APP_NAME}.</>,
            ]}
          />
          {mcpUrl && <CopyField value={claudeCodeCommand} label="Install command" />}
        </ClientSection>

        <ClientSection title="Other assistants">
          <Steps
            items={[
              <>Open your assistant's connector or MCP server settings.</>,
              <>Create a new remote server connection.</>,
              <>Name it {APP_NAME} and paste the connection URL above.</>,
              <>Finish the sign-in and approval prompts.</>,
              <>Enable the connection, then ask the assistant to use {APP_NAME}.</>,
            ]}
          />
        </ClientSection>
      </Card>

      <Card className="space-y-6 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Refresh after {APP_NAME} updates
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assistants remember what {APP_NAME} could do when you first connected. After we ship new
            capabilities, refresh the connection to pick them up.
          </p>
        </div>

        <ClientSection title="ChatGPT">
          <Steps
            items={[
              <>Open ChatGPT's Plugins page and select {APP_NAME}.</>,
              <>Scroll to “Information” and click Refresh.</>,
              <>
                ChatGPT can't change an existing connector's URL — if the URL above has changed,
                delete the connector and add it again.
              </>,
              <>Start a new chat and ask ChatGPT to use {APP_NAME}.</>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Claude">
          <Steps
            items={[
              <>Open the Connectors page and select {APP_NAME}.</>,
              <>Refresh or update the connector.</>,
              <>
                Claude can't change an existing connector's URL — if it changed, remove the
                connector and add it again.
              </>,
              <>Ask Claude to use {APP_NAME}.</>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Claude Code">
          <Steps
            items={[
              <>Start a new session — it loads the latest capabilities when it connects.</>,
              <>
                If the URL changed, run{" "}
                <code className="font-mono text-foreground">claude mcp remove {APP_SLUG}</code>,
                then run the install command again.
              </>,
              <>Ask Claude Code to use {APP_NAME}.</>,
            ]}
          />
        </ClientSection>

        <ClientSection title="Other assistants">
          <Steps
            items={[
              <>Open your assistant's connector settings and select {APP_NAME}.</>,
              <>Refresh the connection, reload the server, or reconnect it.</>,
              <>If the URL changed, paste the latest one from above.</>,
              <>Start a new chat and ask the assistant to use {APP_NAME}.</>,
            ]}
          />
        </ClientSection>
      </Card>
    </div>
  );
}
