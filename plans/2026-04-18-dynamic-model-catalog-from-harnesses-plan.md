# Dynamic model catalog from agent harnesses plan

## Problem

`packages/agent-acp/src/model-catalog.ts` currently hard-wires the model list and most model metadata for each downstream provider. That makes the `/model` procedure and the TUI picker drift from the models actually exposed by the installed ACP harnesses.

## Proposed approach

Move the source of truth from a static in-repo catalog to a live ACP discovery layer in `@nanoboss/agent-acp`. The new layer should open a short-lived ACP session for a provider, read the session's advertised models and model-related config options, normalize that into the existing catalog shape, and cache the result briefly for UI/procedure use.

Keep only stable, non-discoverable metadata static:

- provider order
- provider display labels
- reasoning-effort label text
- parsing helpers for slash-form model selectors

Everything else should come from the harness whenever possible.

## Discovery design

### 1. Add an async catalog discovery API in `@nanoboss/agent-acp`

Create a new async entry point, for example:

```ts
discoverAgentCatalog(provider, options?)
```

Responsibilities:

- resolve the provider's harness command/args from the existing config helpers
- open ACP with `openAcpConnection(...)`
- create a short-lived session with `buildAgentRuntimeSessionRuntime()`
- read:
  - `session.models?.availableModels`
  - `session.models?.currentModelId`
  - `session.configOptions`
- normalize the result into `AgentCatalogEntry`
- close the probe session/connection cleanly

### 2. Normalize provider-specific model shapes

Use a common normalization path with provider-specific supplements:

- **Copilot**
  - read base models from `session.models.availableModels` or the `model` config select
  - for each model, set the temporary probe session's `model` config value and inspect the returned `reasoning_effort` config option
  - record model-specific supported/default reasoning efforts
  - treat absence of `reasoning_effort` as "no reasoning selector for this model"
- **Codex**
  - `availableModels` currently arrives as fully expanded selectors such as `gpt-5.4/xhigh`
  - collapse these into base model entries plus supported reasoning efforts for the normalized catalog
  - preserve direct acceptance of slash-form model ids in validation
- **Claude**
  - use `availableModels` directly
  - do not synthesize hidden models that are not advertised by the harness
- **Gemini**
  - use `availableModels` directly, including "auto" selectors if the harness exposes them

### 3. Add a cache with explicit refresh support

Catalog discovery should not run on every keystroke. Add a small cache keyed by the effective provider harness config:

- provider
- command
- args
- selected environment shape if needed

Recommended behavior:

- memoize successful discoveries for a short TTL
- allow callers to force a refresh
- fail closed per provider instead of poisoning the cache globally

## Surface integration

### 4. Convert catalog consumers to the async discovery API

The current sync helpers are used in both procedures and the TUI. Update them so callers can await live data:

- `procedures/model.ts`
  - list models from discovered catalog
  - validate `/model <provider> <model>` against discovered catalog
  - show discovered names/descriptions in success and help output
- `packages/adapters-tui/src/app.ts`
  - populate the inline model picker from discovered catalog
- `packages/adapters-tui/src/commands.ts`
  - remove the current synchronous `isKnownModelSelection(...)` dependency from `parseModelSelectionCommand(...)`
  - either:
    - make the inline selection validation async in the controller path, or
    - parse provider/model syntactically first and validate after control returns to the async controller flow

The second option is likely the least invasive because `handleSubmit(...)` is already async.

### 5. Decide the fallback/error path

If discovery fails for a provider, choose one consistent behavior:

- preferred: surface a clear error like "Failed to refresh models from `<provider>` harness"
- optional compatibility fallback: keep a minimal static emergency catalog only if needed to avoid breaking `/model`

The implementation should avoid silently falling back to a stale hard-coded full catalog, because that defeats the point of dynamic refresh.

## Tests

### 6. Replace hard-coded catalog assertions with discovery-shape tests

Update `packages/agent-acp/tests/model-catalog.test.ts` and related callers to test normalization and async lookup behavior using mocked ACP session payloads.

Coverage should include:

- Copilot models discovered from ACP, including `claude-opus-4.7`
- Copilot model-specific reasoning options (`gpt-5.4` gets `xhigh`, `gpt-4.1` does not)
- Codex slash-model normalization and validation
- Claude/Gemini pass-through discovery
- cache hit, cache miss, and force-refresh behavior
- clean failure reporting when harness discovery fails
- TUI inline `/model provider model` path still works after async validation changes

## Documentation

### 7. Document the new source of truth

Update the relevant README or package docs to say:

- the model list is discovered from installed ACP harnesses
- results may vary by account, harness version, and provider capabilities
- `/model <provider>` refreshes or uses a recent cached discovery result

## Notes

- In the live Copilot ACP probe, `claude-opus-4.7` was present in both `session.models.availableModels` and the `model` config selector.
- ACP model discovery lives on the session response (`models`, `configOptions`), not the top-level `initialize()` capabilities payload.
- Copilot's reasoning selector is model-dependent, so discovery needs to probe the selected model state instead of assuming one fixed effort map.
