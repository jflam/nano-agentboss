# nano-agentboss

To install dependencies:

```bash
bun install
```

To run the ACP server directly:

```bash
bun run server
```

To start the local REPL client:

```bash
bun run cli
```

Tool call progress lines are shown by default. Hide them with:

```bash
bun run cli --no-tool-calls
```

By default the REPL spawns `copilot --acp --allow-all-tools`. In that default path,
nano-agentboss does not set a model, so the downstream Copilot CLI uses its own
default model unless a procedure selects one explicitly. Override the downstream
agent with `NANO_AGENTBOSS_AGENT_CMD` and `NANO_AGENTBOSS_AGENT_ARGS` if needed.

To lint the repository:

```bash
bun run lint
```

Typed downstream agent outputs should use `jsonType(...)` from `src/types.ts` with concrete `typia`
inputs, for example `jsonType<Result>(typia.json.schema<Result>(), typia.createValidate<Result>())`,
instead of handwritten schema/validator descriptors. Bun preload for the typia transform is configured
in `bunfig.toml`.
