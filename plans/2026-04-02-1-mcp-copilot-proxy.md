# MCP server fix narrative

The commits do **not** include a written postmortem, so this reconstruction comes from the order and content of today’s diffs rather than an explicit author narrative.[L1][S2][S3][S4][S5][S6]

## Stage 1

At 11:14, `Fix ACP top-level session MCP wiring` changed ACP `newSession(...)` to accept a client-selected `nanobossSessionId`, let `NanobossService.createSession(...)` honor an explicit `sessionId`, and returned metadata that distinguished `commands` from `mcp+commands` depending on whether the top-level session MCP was attached.[S2]

That same metadata also said that, when top-level MCP was absent, ACP top-level sessions could advertise available commands but session MCP still had to be attached by the creating client through `mcpServers`.[S2]

So the first fix corrected session identity and ACP wiring, but it still assumed the client would perform the MCP attachment step, which is why it was only a partial repair rather than the final shape of the solution.[S2][S3]

## Stage 2

At 12:41, `Add static MCP doctor and proxy commands` changed direction by adding `nanoboss doctor --register` and `nanoboss mcp proxy`, documenting both in the README and adding registration code for Claude Code, Codex, Gemini CLI, and Copilot CLI.[S3]

The tests added in that commit show the registration flow writing stdio MCP config for Gemini and Copilot and using each agent CLI to add the `nanoboss` server for Claude and Codex.[S3]

That was the architectural course correction: instead of depending on ACP top-level session wiring, the codebase now had a standalone MCP server that agents could register directly.[S3]

## Stage 3

The brand-new proxy still was not fully right, because its `initialize` response said the tools would default to the current session when possible, while the implementation created `SessionMcpApi` from only `cwd` and did not yet persist any current-session pointer.[S3]

Five seconds later, `Default session MCP lookups to current session` added `current-session.json`, wrote that pointer whenever a session was created, made `sessionId` optional in the session MCP API, and resolved missing `sessionId` and `rootDir` values from the saved current-session pointer.[L1][S4]

The new proxy test in that commit then called `top_level_runs` without passing `sessionId` and expected the current session’s cell to come back, which shows exactly what the previous commit had not yet made work.[S4]

## Stage 4

The last real MCP-server breakage was Copilot-specific stdio transport. The first proxy/server implementations used hand-written JSON-RPC loops that only parsed `Content-Length` framed messages and wrote responses back in `Content-Length` form.[S3]

At 13:13, `Fix Copilot stdio MCP framing` replaced those loops with a shared `stdio-jsonrpc` helper that can parse newline-delimited JSON (`jsonl`) or `Content-Length` framing and serialize responses in either mode.[S5]

The updated MCP proxy and session-MCP stdio tests changed their client writes from `Content-Length` headers to plain JSON lines, and the new framing tests explicitly covered JSONL input, `Content-Length` input, blank-line trimming, and dual-mode serialization.[S5]

That is the point where the story reads as finally correct for Copilot MCP: there was now a static server to register, a default current-session target, and a transport layer that matched native Copilot MCP connections.[S3][S4][S5]

## Stage 5

At 13:27, `Fix Copilot token log discovery for ACP` changed token snapshot collection to search logs for the spawned Copilot process family instead of only the direct wrapper PID, and it added a fallback to recent Copilot process logs.[S6]

That improved token-usage footers under Copilot ACP, but it addressed telemetry discovery after the MCP transport work rather than changing MCP registration or MCP framing itself.[S6]

## Conclusion

The sequence shows that we got it wrong in stages. We first treated the problem as ACP top-level session wiring, which was too narrow for the actual failure mode.[S2][S3]

We then corrected course by adding a standalone MCP proxy and registration flow, immediately discovered that the proxy still lacked a reliable way to pick the current session, and finally fixed the Copilot-specific wire-format mismatch by accepting JSONL framing in addition to `Content-Length`.[S3][S4][S5]

The blunt version is: we first fixed identity, then distribution, then session targeting, and only then the Copilot transport details that were still breaking the server.[S2][S3][S4][S5]

## Sources

- [L1] Local git history in `/Users/jflam/agentboss/workspaces/nanoboss`: `git --no-pager log --since='2026-04-02 00:00' --date=iso --format='%H%x09%ad%x09%s'`.
- [S2] Commit `57d6c21e4f97dee176a6d1aac5a0609a8383aa18`, "Fix ACP top-level session MCP wiring". GitHub: https://github.com/jflam/nanoboss/commit/57d6c21e4f97dee176a6d1aac5a0609a8383aa18
- [S3] Commit `339f27dedb06f46aafe5ada1d9782724cce0d85d`, "Add static MCP doctor and proxy commands" (including `README.md`, `src/doctor.ts`, `src/mcp-proxy.ts`, `src/mcp-registration.ts`, and `tests/unit/mcp-registration.test.ts`). GitHub: https://github.com/jflam/nanoboss/commit/339f27dedb06f46aafe5ada1d9782724cce0d85d
- [S4] Commit `30b583bcff7ea2c56e47a3028ff1e4e709c3ed1e`, "Default session MCP lookups to current session". GitHub: https://github.com/jflam/nanoboss/commit/30b583bcff7ea2c56e47a3028ff1e4e709c3ed1e
- [S5] Commit `19e8a2b502e68817f70c7a86d99cb07573d7f84b`, "Fix Copilot stdio MCP framing". GitHub: https://github.com/jflam/nanoboss/commit/19e8a2b502e68817f70c7a86d99cb07573d7f84b
- [S6] Commit `113b373e825ba93031f0cfc0060328e822b28c97`, "Fix Copilot token log discovery for ACP". GitHub: https://github.com/jflam/nanoboss/commit/113b373e825ba93031f0cfc0060328e822b28c97
