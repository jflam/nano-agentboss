# Procedure packages

Nanoboss supports grouping related procedures and helpers into a subdirectory under a command root such as:

- `./commands` in the current workspace
- `~/.nanoboss/commands` in the profile directory

This lets you keep a procedure's entrypoints and helper modules together instead of splitting thin wrappers from implementation code.

## Is a manifest needed?

**No.** There is no separate `manifest.json`, `package.json`, or `procedure.yaml` file for procedure packages.

Instead, nanoboss scans `.ts` files recursively under each command root and infers lightweight procedure metadata directly from the source file. For disk-loaded procedures, keep these fields as static string literals on the default export:

- `name`
- `description`
- `inputHint` (optional)
- `executionMode` (optional)

## Recommended layout

```text
commands/
  autoresearch/
    index.ts
    start.ts
    continue.ts
    status.ts
    clear.ts
    finalize.ts
    runner.ts
    git.ts
    state.ts
    log.ts
    benchmark.ts
    types.ts
```

The entrypoint files export procedures. The other files are plain helpers imported by those entrypoints.

## How discovery works

Nanoboss recursively walks the command roots and registers `.ts` files that look like procedure modules.

A file is treated as a procedure when it exports a default object with procedure-shaped metadata and an `execute(...)` handler. Helper files are ignored as long as they do not export a default procedure.

That means this is a valid packaged procedure entrypoint:

```ts
import type { Procedure } from "../../src/core/types.ts";
import { executeAutoresearchStartCommand } from "./runner.ts";

export default {
  name: "autoresearch-start",
  description: "Create a new autoresearch session and run a bounded foreground loop",
  inputHint: "Optimization goal",
  async execute(prompt, ctx) {
    return await executeAutoresearchStartCommand(prompt, ctx);
  },
} satisfies Procedure;
```

And this is a valid helper:

```ts
export function chooseNextExperiment(): string {
  return "example";
}
```

## Conventions

1. Keep procedure metadata static. Avoid computing `name` or `description` dynamically.
2. Use unique procedure names. Slash-command names come from the exported `name`, not the file path.
3. Put reusable logic in helper modules next to the procedure entrypoints.
4. Prefer relative imports within the package such as `./runner.ts` and `./types.ts`.
5. Use a package when several procedures share helpers or state; keep single-file procedures flat when that is simpler.

## Built-in procedures vs disk-loaded procedures

There are two ways procedure packages show up in nanoboss:

1. **Disk-loaded procedures** live under a workspace or profile command root and are discovered automatically.
2. **Built-in procedures** live in the repo and are imported explicitly from `src/procedure/registry.ts`.

If you are adding a new built-in package to nanoboss itself, create the package directory under `commands/` and update the builtin imports in `src/procedure/registry.ts`.

## Current limitation

`/create` still writes a single `.ts` procedure file today. If you want a packaged procedure, create the directory structure manually and move the generated file into it.
