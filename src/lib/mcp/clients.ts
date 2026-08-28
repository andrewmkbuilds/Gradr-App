import { MCP_TOOLS } from "./catalog";

export const MCP_APP_NAME = "Gradr";
export const MCP_APP_SLUG = "gradr";

export type McpClientId = "chatgpt" | "claude" | "claude-code" | "cursor" | "vscode" | "other";

export type McpClient = {
  id: McpClientId;
  label: string;
  /** Label for the button that opens the client's connector setup surface. */
  deepLinkLabel: string;
  /** Deep link that opens the client's connector setup with the URL prefilled where supported. */
  deepLink: (mcpUrl: string) => string | null;
  /** Terminal command, when the client is set up from a shell. */
  command?: (mcpUrl: string) => string;
  steps: (mcpUrl: string) => string[];
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function cursorConfig(mcpUrl: string): string {
  const json = JSON.stringify({ url: mcpUrl, type: "http" });
  if (typeof btoa === "function") return btoa(json);
  return Buffer.from(json, "utf8").toString("base64");
}

export const MCP_CLIENTS: McpClient[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    deepLinkLabel: "Open ChatGPT connector setup",
    deepLink: () =>
      "https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins",
    steps: (mcpUrl) => [
      "Open ChatGPT settings → Connectors → Advanced and turn on Developer mode (a workspace admin may need to enable it).",
      "Open the new connector dialog from Settings → Connectors → Create.",
      `Name it ${MCP_APP_NAME} and paste the connection URL: ${mcpUrl}`,
      'Tick "I understand and want to continue", then click Create.',
      `Sign in to ${MCP_APP_NAME} and approve access when prompted.`,
      `Enable ${MCP_APP_NAME} from the chat composer, then ask ChatGPT to use it.`,
    ],
  },
  {
    id: "claude",
    label: "Claude",
    deepLinkLabel: "Open Claude connector setup (prefilled)",
    deepLink: (mcpUrl) =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
        MCP_APP_NAME,
      )}&connectorUrl=${encodeURIComponent(mcpUrl)}`,
    steps: (mcpUrl) => [
      "Open the prefilled connector dialog (or Settings → Connectors → Add custom connector).",
      `Confirm the name is ${MCP_APP_NAME} and the URL is: ${mcpUrl}`,
      "Click Add, then sign in and approve access.",
      "Enable the connector from the chat composer, then ask Claude to use it.",
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    deepLinkLabel: "Open Claude Code MCP docs",
    deepLink: () => "https://docs.claude.com/en/docs/claude-code/mcp",
    command: (mcpUrl) =>
      `claude mcp add --scope user --transport http ${MCP_APP_SLUG} ${shellQuote(mcpUrl)}`,
    steps: (mcpUrl) => [
      `Run: claude mcp add --scope user --transport http ${MCP_APP_SLUG} ${shellQuote(mcpUrl)}`,
      "Start Claude Code and run /mcp to confirm the server is connected.",
      "Sign in and approve access in the browser window that opens.",
      `Ask Claude Code to use ${MCP_APP_NAME}.`,
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    deepLinkLabel: "Add to Cursor (prefilled)",
    deepLink: (mcpUrl) =>
      `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(
        MCP_APP_SLUG,
      )}&config=${encodeURIComponent(cursorConfig(mcpUrl))}`,
    steps: (mcpUrl) => [
      "Click the Add to Cursor link, or open Cursor → Settings → MCP → Add new global MCP server.",
      `Add an HTTP server named ${MCP_APP_SLUG} with the URL: ${mcpUrl}`,
      "Save, then complete the sign-in and approval prompt.",
      `Ask Cursor's agent to use ${MCP_APP_NAME}.`,
    ],
  },
  {
    id: "vscode",
    label: "VS Code / Copilot",
    deepLinkLabel: "Add to VS Code (prefilled)",
    deepLink: (mcpUrl) =>
      `vscode:mcp/install?${encodeURIComponent(
        JSON.stringify({ name: MCP_APP_SLUG, type: "http", url: mcpUrl }),
      )}`,
    steps: (mcpUrl) => [
      "Click the Add to VS Code link, or run the “MCP: Add Server” command.",
      `Choose HTTP and paste the URL: ${mcpUrl}`,
      `Name the server ${MCP_APP_SLUG} and save it to your user settings.`,
      "Sign in and approve access, then use it from Copilot Chat in Agent mode.",
    ],
  },
  {
    id: "other",
    label: "Other assistants",
    deepLinkLabel: "Read the MCP connector spec",
    deepLink: () => "https://modelcontextprotocol.io/docs/develop/connect-local-servers",
    steps: (mcpUrl) => [
      "Open your assistant's connector or MCP server settings.",
      "Create a new remote (streamable HTTP) server connection.",
      `Name it ${MCP_APP_NAME} and paste the URL: ${mcpUrl}`,
      "Finish the sign-in and approval prompts.",
      `Enable the connection, then ask the assistant to use ${MCP_APP_NAME}.`,
    ],
  },
];

export function getMcpClient(id: McpClientId): McpClient {
  return MCP_CLIENTS.find((client) => client.id === id) ?? MCP_CLIENTS[MCP_CLIENTS.length - 1];
}

/** Plain-text instruction sheet the user can download for their chosen client. */
export function buildInstructionsFile(client: McpClient, mcpUrl: string): string {
  const lines: string[] = [
    `${MCP_APP_NAME} — connect ${client.label}`,
    "".padEnd(40, "="),
    "",
    `Connection URL: ${mcpUrl || "(unavailable in this environment)"}`,
    "This URL is not a secret. You still sign in and approve access before any data is shared.",
    "",
    "Steps",
    "-----",
    ...client.steps(mcpUrl).map((step, index) => `${index + 1}. ${step}`),
    "",
    "Tools your assistant gets",
    "-------------------------",
    ...MCP_TOOLS.map(
      (tool) => `- ${tool.name} (${tool.readOnly ? "read-only" : "can make changes"}): ${tool.description}`,
    ),
    "",
    "Troubleshooting",
    "---------------",
    "- Sign-in loop or 401: remove the connector and add it again so it starts a fresh OAuth flow.",
    "- 404 / not found: the URL is wrong or outdated — copy it again from the Connect page.",
    "- Blocked request or CORS error: a VPN, proxy or browser extension is blocking the endpoint.",
    "- Missing new tools: refresh the connector, or start a new chat session.",
    "",
    `Generated ${new Date().toISOString()}`,
    "",
  ];
  return lines.join("\n");
}
