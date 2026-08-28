import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_SERVER, MCP_TOOLS } from "@/lib/mcp/catalog";
import { MCP_CLIENTS, buildInstructionsFile, getMcpClient } from "@/lib/mcp/clients";

type Manifest = {
  mcp: {
    server: { name: string; version: string; title?: string };
    tools: { name: string; title?: string; description?: string; annotations?: { readOnlyHint?: boolean } }[];
  };
};

const manifest = JSON.parse(readFileSync(".lovable/mcp/manifest.json", "utf8")) as Manifest;

describe("MCP tool catalog", () => {
  it("matches the generated MCP manifest", () => {
    expect(MCP_SERVER.name).toBe(manifest.mcp.server.name);
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(manifest.mcp.tools.map((tool) => tool.name));
    for (const tool of manifest.mcp.tools) {
      const entry = MCP_TOOLS.find((candidate) => candidate.name === tool.name);
      expect(entry, tool.name).toBeDefined();
      expect(entry?.description).toBe(tool.description ?? "");
      expect(entry?.readOnly).toBe(Boolean(tool.annotations?.readOnlyHint));
    }
  });
});

describe("MCP client instructions", () => {
  const url = "https://example.supabase.co/functions/v1/mcp";

  it("prefills the connection URL in deep links that support it", () => {
    const claude = getMcpClient("claude").deepLink(url);
    expect(claude).toContain(encodeURIComponent(url));
    const cursor = getMcpClient("cursor").deepLink(url);
    expect(cursor?.startsWith("cursor://")).toBe(true);
  });

  it("builds a downloadable instruction sheet containing the URL and tools", () => {
    for (const client of MCP_CLIENTS) {
      const file = buildInstructionsFile(client, url);
      expect(file).toContain(url);
      expect(file).toContain(MCP_TOOLS[0].name);
      expect(file).toContain("Troubleshooting");
    }
  });
});
