# Archived superseded plans

These plans are retained only as historical context.

They are **not** the current architecture.

## Current decision

Nanoboss no longer uses attached or session-scoped MCP servers such as `nanoboss-session`.

Current architecture:
- one globally registered MCP server: `nanoboss`
- implementation: `src/mcp/server.ts`
- entrypoint: `src/mcp/proxy.ts`
- registration/setup: `src/mcp/registration.ts`
- transport overview: `docs/architecture.md`

If an archived plan conflicts with the live code, the live code and `docs/architecture.md` win.
