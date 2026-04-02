import type * as acp from "@agentclientprotocol/sdk";

import { disposeSessionMcpHttpServer } from "./session-mcp-http.ts";
import { buildSessionMcpStdioServer } from "./session-mcp-stdio.ts";
import type { DownstreamAgentConfig } from "./types.ts";

interface SessionMcpAttachmentParams {
  config: DownstreamAgentConfig;
  sessionId: string;
  cwd: string;
  rootDir?: string;
}

export function buildSessionMcpServers(
  params: SessionMcpAttachmentParams,
): acp.NewSessionRequest["mcpServers"] {
  return [
    // ACP guarantees stdio MCP support for all agents, while HTTP is optional.
    buildSessionMcpStdioServer(params),
  ];
}

export function disposeSessionMcpTransport(sessionId: string): void {
  disposeSessionMcpHttpServer(sessionId);
}
