# Nanoboss Architecture

Last updated: 2026-05-06

This document describes the current Nanoboss runtime architecture, package
layers, entry paths, and major ownership boundaries.

## Whole-Project Shape

```mermaid
flowchart TD
  User[User or external client]
  CLI[nanoboss cli]
  HTTPCommand[nanoboss http]
  ACPCommand[nanoboss acp-server]
  MCPCommand[nanoboss mcp]

  TUI["@nanoboss/adapters-tui<br/>interactive terminal frontend"]
  HTTP["@nanoboss/adapters-http<br/>HTTP/SSE protocol"]
  ACPServer["@nanoboss/adapters-acp-server<br/>internal ACP stdio adapter"]
  MCP["@nanoboss/adapters-mcp<br/>MCP stdio tools"]

  Runtime["@nanoboss/app-runtime<br/>live sessions and runtime tools"]
  Catalog["@nanoboss/procedure-catalog<br/>procedure registry and discovery"]
  Engine["@nanoboss/procedure-engine<br/>procedure execution and dispatch jobs"]
  Store["@nanoboss/store<br/>durable sessions, runs, refs"]
  Agent["@nanoboss/agent-acp<br/>downstream ACP agents"]
  SDK["@nanoboss/procedure-sdk<br/>author-facing contracts and helpers"]
  Contracts["@nanoboss/contracts<br/>shared durable types"]
  Support["@nanoboss/app-support<br/>filesystem, build, process helpers"]

  ExtCatalog["@nanoboss/tui-extension-catalog<br/>TUI extension discovery"]
  ExtSDK["@nanoboss/tui-extension-sdk<br/>TUI extension authoring types"]

  Downstream[Downstream ACP agent\nCodex, Claude, Gemini, Copilot]
  Disk[(~/.nanoboss\nsessions, cells, attachments, settings)]

  User --> CLI
  User --> HTTPCommand
  User --> ACPCommand
  User --> MCPCommand

  CLI --> TUI
  TUI --> HTTP
  HTTPCommand --> HTTP
  ACPCommand --> ACPServer
  MCPCommand --> MCP

  HTTP --> Runtime
  ACPServer --> Runtime
  MCP --> Runtime

  Runtime --> Catalog
  Runtime --> Engine
  Runtime --> Store
  Runtime --> Agent

  Engine --> Store
  Engine --> Agent
  Engine --> SDK
  Catalog --> SDK
  Agent --> Downstream
  Store --> Disk

  TUI --> ExtCatalog
  ExtCatalog --> ExtSDK

  SDK --> Contracts
  Store --> Contracts
  Runtime --> Contracts
  Engine --> Contracts

  HTTP --> Support
  ACPServer --> Support
  MCP --> Support
  Runtime --> Support
  Store --> Support
  Agent --> Support
```

The project now has four adapter entry paths into one runtime core:

| Entry path | Adapter package | Runtime call path |
| --- | --- | --- |
| `nanoboss cli` | `@nanoboss/adapters-tui` plus `@nanoboss/adapters-http` | private local HTTP/SSE server to `NanobossService` |
| `nanoboss http` | `@nanoboss/adapters-http` | direct HTTP/SSE calls to `NanobossService` |
| `nanoboss acp-server` | `@nanoboss/adapters-acp-server` | ACP stdio calls to `NanobossService` |
| `nanoboss mcp` | `@nanoboss/adapters-mcp` | MCP stdio calls to `NanobossRuntimeService` |

## Runtime Flow

```mermaid
sequenceDiagram
  participant Frontend as TUI / HTTP / ACP client
  participant Adapter as Adapter package
  participant Runtime as NanobossService
  participant Catalog as ProcedureRegistry
  participant Engine as ProcedureEngine
  participant Store as SessionStore
  participant Agent as Agent ACP runtime
  participant Child as Downstream agent

  Frontend->>Adapter: create or resume session
  Adapter->>Runtime: createSessionReady / resumeSessionReady
  Runtime->>Catalog: load builtins and disk procedures
  Runtime->>Store: persist session metadata
  Runtime-->>Adapter: session descriptor and commands

  Frontend->>Adapter: prompt or slash command
  Adapter->>Runtime: promptSession(...)
  Runtime->>Engine: executeProcedure(...)
  Engine->>Store: write root and child run records
  Engine->>Agent: ctx.agent.run(...) when needed
  Agent->>Child: ACP prompt over stdio
  Child-->>Agent: streamed ACP updates
  Agent-->>Engine: text, tool calls, token metrics
  Engine-->>Runtime: procedure updates and result
  Runtime-->>Adapter: runtime/frontend event stream
  Adapter-->>Frontend: rendered updates
```

Foreground sessions use `NanobossService`. Tool-style clients use
`NanobossRuntimeService`, a narrower service for MCP operations such as listing
runs, reading refs, getting schemas, and starting or waiting on async dispatch
jobs.

## Package Layers

```mermaid
flowchart TB
  subgraph Adapters
    TUI2[adapters-tui]
    HTTP2[adapters-http]
    ACP2[adapters-acp-server]
    MCP2[adapters-mcp]
  end

  subgraph Application
    Runtime2[app-runtime]
  end

  subgraph Domain
    Engine2[procedure-engine]
    Catalog2[procedure-catalog]
    Agent2[agent-acp]
    Store2[store]
  end

  subgraph ContractsAndSupport
    SDK2[procedure-sdk]
    Contracts2[contracts]
    Support2[app-support]
  end

  subgraph Extensions
    TuiCatalog2[tui-extension-catalog]
    TuiSdk2[tui-extension-sdk]
  end

  Adapters --> Application
  Application --> Domain
  Domain --> ContractsAndSupport
  Application --> ContractsAndSupport
  Adapters --> ContractsAndSupport
  TUI2 --> TuiCatalog2
  TuiCatalog2 --> TuiSdk2
  TuiSdk2 --> SDK2
```

The package architecture is guarded by tests that require:

- package manifests must declare only allowed workspace dependencies
- the allowed workspace dependency graph must stay acyclic
- package entrypoints must be explicit instead of wildcard barrels
- root code must import packages through package APIs, not package-internal paths
- guarded implementation packages must be free of relative import cycles

## Package Responsibilities

| Package | Owns |
| --- | --- |
| `@nanoboss/adapters-tui` | Interactive terminal frontend, private local server boot, terminal rendering, TUI state, and extension contribution boot |
| `@nanoboss/adapters-http` | HTTP and SSE protocol surface for foreground runtime sessions |
| `@nanoboss/adapters-acp-server` | Internal ACP stdio adapter for runtime sessions |
| `@nanoboss/adapters-mcp` | MCP stdio tools for session, run, ref, schema, and async procedure dispatch operations |
| `@nanoboss/app-runtime` | Live session orchestration, runtime event publication, prompt execution entrypoints, and runtime service APIs |
| `@nanoboss/procedure-engine` | Procedure execution, child run recording, dispatch jobs, cancellation watching, and procedure result shaping |
| `@nanoboss/procedure-catalog` | Built-in and disk procedure discovery and registry loading |
| `@nanoboss/store` | Durable session, run, cell, attachment, and ref persistence |
| `@nanoboss/agent-acp` | Downstream ACP agent process management and streamed agent interaction |
| `@nanoboss/procedure-sdk` | Procedure author contracts, helper APIs, cancellation policy, procedure UI marker contracts, and procedure-facing result types |
| `@nanoboss/contracts` | Shared durable data contracts used across runtime, engine, store, and SDK boundaries |
| `@nanoboss/app-support` | Filesystem, build, process, environment, and shared app support helpers |
| `@nanoboss/tui-extension-catalog` | TUI extension discovery and loading |
| `@nanoboss/tui-extension-sdk` | TUI extension authoring types and contracts |

## TUI Internal Shape

`@nanoboss/adapters-tui` is organized by owner directory:

```mermaid
flowchart LR
  Run[run\nCLI startup, private server, TTY]
  App[app\nterminal app and composer wiring]
  Controller[controller\nsession and prompt control flow]
  Reducer[reducer\nfrontend event state transitions]
  State[state\nUI records and initial state]
  Views[views\nterminal rendering]
  Core[core\nbuilt-in chrome, bindings, panels]
  Components[components\ntool cards and messages]
  Theme[theme\npalette and ANSI formatting]
  Extensions[extensions\nadapter contribution boot]
  Overlays[overlays\npickers and continuations]
  Clipboard[clipboard\nplatform providers]

  Run --> App
  App --> Controller
  Controller --> Reducer
  Reducer --> State
  App --> Views
  Views --> State
  Views --> Components
  Views --> Theme
  Core --> Theme
  Extensions --> Core
  App --> Overlays
  App --> Clipboard
```

Each directory owns a stable TUI concern. New TUI behavior should enter through
the existing owner directory and public local APIs for that concern.

## Persistence

Nanoboss persists workspace-independent runtime state under `~/.nanoboss`.
Session, run, cell, attachment, and stored ref materialization are owned by
`@nanoboss/store`; runtime packages should use store APIs instead of shaping
durable records directly.

## Agent Execution

Procedure execution that needs a downstream model flows through
`@nanoboss/procedure-engine` into `@nanoboss/agent-acp`. The engine owns
Nanoboss run records, dispatch job lifecycle, cancellation observation, and
procedure-facing output events. The agent package owns ACP process transport,
model selection at the ACP boundary, and streamed child-agent communication.

## Extensions

TUI extension discovery is separate from extension authoring contracts.
`@nanoboss/tui-extension-catalog` locates and loads contributions, while
`@nanoboss/tui-extension-sdk` defines the types extension authors consume.
