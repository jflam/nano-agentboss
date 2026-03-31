# nano-agentboss

To install dependencies:

```bash
bun install
```

## Unified entrypoint

Everything now goes through a single `nanoboss` entrypoint.

During development:

```bash
bun run nanoboss --help
```

## Build the `nanoboss` binary

The build command is:

```bash
bun run build
```

This compiles the standalone `nanoboss` binary and installs it onto your `PATH`.

By default the build installs `nanoboss` into the first suitable user-owned PATH
location, preferring `~/.local/bin`, then `~/bin`, then `~/.bun/bin`.

It also leaves the compiled artifact at:

```bash
dist/nanoboss
```

To override the install location:

```bash
NANOBOSS_INSTALL_DIR=~/bin bun run build
```

The compiled binary includes the built-in commands. By default it skips loading
additional `.ts` commands from `./commands` at runtime. If you want to opt back
into disk-loaded commands, set:

```bash
NANO_AGENTBOSS_LOAD_DISK_COMMANDS=1
```

## Commands

Launch the CLI frontend:

```bash
bun run nanoboss cli
```

Launch the HTTP/SSE server:

```bash
bun run nanoboss server --port 3000
```

Connect the CLI to a running server:

```bash
bun run nanoboss cli --server-url http://localhost:3000
```

The internal stdio ACP server is still available for local CLI mode:

```bash
bun run nanoboss acp-server
```

Tool call progress lines are shown by default. Hide them with:

```bash
bun run nanoboss cli --no-tool-calls
```

For convenience, the old script names still route through the unified entrypoint:

```bash
bun run cli
bun run server
```

By default the local REPL path spawns `copilot --acp --allow-all-tools`. In that default path,
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
