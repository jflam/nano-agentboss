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

By default the REPL spawns `copilot --acp --allow-all-tools`. Override the downstream
agent with `NANO_AGENTBOSS_AGENT_CMD` and `NANO_AGENTBOSS_AGENT_ARGS` if needed.
