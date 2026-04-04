export interface JsonRpcToolMetadata {
  name: string;
  description: string;
  inputSchema: object;
}

export async function dispatchMcpToolsMethod<Api>(params: {
  api: Api;
  method: string;
  messageParams: unknown;
  protocolVersion: string;
  serverName: string;
  serverVersion: string;
  instructions: string;
  listTools: () => JsonRpcToolMetadata[];
  callTool: (api: Api, name: string, args: Record<string, unknown>) => Promise<unknown>;
  formatToolResult: (toolName: string, result: unknown) => unknown;
}): Promise<unknown> {
  switch (params.method) {
    case "initialize":
      return {
        protocolVersion: params.protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: params.serverName,
          version: params.serverVersion,
        },
        instructions: params.instructions,
      };
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: params.listTools(),
      };
    case "tools/call": {
      const record = asObject(params.messageParams);
      const name = asString(record.name, "name");
      const args = record.arguments === undefined ? {} : asObject(record.arguments);
      return params.formatToolResult(name, await params.callTool(params.api, name, args));
    }
    default:
      throw new Error(`Unsupported MCP method: ${params.method}`);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${name} to be a non-empty string`);
  }

  return value;
}
