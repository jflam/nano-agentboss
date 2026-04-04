import type * as acp from "@agentclientprotocol/sdk";

import type { DownstreamAgentConfig } from "../core/types.ts";

interface SessionMcpAttachmentParams {
  config: DownstreamAgentConfig;
  sessionId: string;
  cwd: string;
  rootDir?: string;
}

export function buildSessionMcpServers(
  _params: SessionMcpAttachmentParams,
): acp.NewSessionRequest["mcpServers"] {
  return [];
}

export function disposeSessionMcpTransport(_sessionId: string): void {}
