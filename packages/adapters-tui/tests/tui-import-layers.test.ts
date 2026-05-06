import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const PACKAGE_ROOT = process.cwd();
const SRC_ROOT = join(PACKAGE_ROOT, "src");

const TUI_OWNER_DIRECTORIES = [
  "app",
  "clipboard",
  "components",
  "controller",
  "core",
  "extensions",
  "overlays",
  "reducer",
  "run",
  "shared",
  "state",
  "theme",
  "views",
] as const;

type TuiOwnerDirectory = typeof TUI_OWNER_DIRECTORIES[number];

type OwnerImportRule = {
  to: TuiOwnerDirectory;
  reason: string;
};

const OWNER_IMPORT_RULES: Record<TuiOwnerDirectory, readonly OwnerImportRule[]> = {
  run: [
    { to: "app", reason: "Run is the CLI boot owner for the TUI app." },
    { to: "extensions", reason: "Run boots extension registries before app startup." },
    { to: "shared", reason: "Run may consume adapter-level public contracts." },
  ],
  app: [
    { to: "clipboard", reason: "App composition owns clipboard provider wiring." },
    { to: "core", reason: "App installs core bindings and form renderers." },
    { to: "overlays", reason: "App owns interactive overlay prompts." },
    { to: "shared", reason: "App may use shared TUI primitives and contracts." },
    { to: "state", reason: "App observes and renders UI state." },
    { to: "theme", reason: "App composes the active TUI theme." },
    { to: "views", reason: "App owns the top-level view composition." },
  ],
  controller: [
    { to: "reducer", reason: "Controller dispatches reducer inputs." },
    { to: "shared", reason: "Controller may use adapter-neutral formatting and command helpers." },
    { to: "state", reason: "Controller reads and updates UI state." },
  ],
  reducer: [
    { to: "shared", reason: "Reducer may use pure formatting helpers for event output." },
    { to: "state", reason: "Reducer owns state transitions over state contracts." },
    { to: "theme", reason: "Reducer actions carry theme-mode values." },
  ],
  views: [
    { to: "components", reason: "Views assemble reusable render components." },
    { to: "core", reason: "Views mount chrome and panel renderers." },
    { to: "shared", reason: "Views render through shared TUI primitives." },
    { to: "state", reason: "Views render UI state." },
    { to: "theme", reason: "Views render with the active TUI theme." },
  ],
  components: [
    { to: "shared", reason: "Components render through shared TUI primitives and tool previews." },
    { to: "state", reason: "Components render state-owned transcript and tool-call shapes." },
    { to: "theme", reason: "Components render with the active TUI theme." },
  ],
  core: [
    { to: "shared", reason: "Core render registries use shared TUI primitives." },
    { to: "state", reason: "Core chrome and panel contracts render UI state." },
    { to: "theme", reason: "Core chrome and panel contracts render with the active TUI theme." },
  ],
  extensions: [
    { to: "core", reason: "Extensions contribute core chrome, binding, and panel registrations." },
    { to: "theme", reason: "Extension activation receives the active TUI theme." },
  ],
  overlays: [
    { to: "shared", reason: "Overlays render through shared TUI primitives." },
    { to: "theme", reason: "Overlays render with the active TUI theme." },
  ],
  state: [
    { to: "shared", reason: "State may reference shared data contracts." },
    { to: "theme", reason: "State persists theme-mode values." },
  ],
  theme: [
    { to: "shared", reason: "Theme definitions wrap shared TUI primitive themes." },
  ],
  clipboard: [],
  shared: [],
};

type FocusedImportAllowlistEntry = {
  from: string;
  to: string;
  reason: string;
};

const FOCUSED_IMPORT_ALLOWLIST = [
  {
    from: "src/app/app-controller-deps.ts",
    to: "src/controller/controller.ts",
    reason: "App-controller wiring is the single app-owned controller dependency adapter.",
  },
  {
    from: "src/app/app-controller-wiring.ts",
    to: "src/controller/controller.ts",
    reason: "App-controller wiring is the single app-owned controller construction path.",
  },
  {
    from: "src/app/app-types.ts",
    to: "src/controller/controller-types.ts",
    reason: "App exposes only controller dependency types across the app/controller boundary.",
  },
  {
    from: "src/clipboard/types.ts",
    to: "src/app/composer.ts",
    reason: "Clipboard image shape is currently owned by the composer contract.",
  },
  {
    from: "src/controller/controller-local-cards.ts",
    to: "src/extensions/command-extensions-card.ts",
    reason: "Controller renders the local extensions command card through the extension owner.",
  },
  {
    from: "src/controller/controller-session.ts",
    to: "src/run/build-freshness.ts",
    reason: "Controller includes the run-owned build freshness notice in session startup cards.",
  },
  {
    from: "src/controller/controller-submit-local-commands.ts",
    to: "src/app/commands.ts",
    reason: "Controller interprets app-owned local command definitions during submit.",
  },
  {
    from: "src/controller/controller-submit.ts",
    to: "src/app/commands.ts",
    reason: "Controller interprets app-owned model selection commands during submit.",
  },
  {
    from: "src/core/core-form-renderers.ts",
    to: "src/overlays/simplify2-continuation-overlay.ts",
    reason: "Core registers the existing simplify2 continuation overlay renderer.",
  },
  {
    from: "src/core/core-form-renderers.ts",
    to: "src/overlays/simplify2-focus-picker-overlay.ts",
    reason: "Core registers the existing simplify2 focus-picker overlay renderer.",
  },
  {
    from: "src/core/core-panels.ts",
    to: "src/components/message-card.ts",
    reason: "Core panel fallback rendering reuses the message card component.",
  },
  {
    from: "src/core/core-system-panels.ts",
    to: "src/components/message-card.ts",
    reason: "Core system panel rendering reuses the message card component.",
  },
  {
    from: "src/reducer/reducer-panel-cards.ts",
    to: "src/core/core-panels.ts",
    reason: "Reducer recognizes core-owned panel payloads while applying run events.",
  },
  {
    from: "src/reducer/reducer-panels.ts",
    to: "src/core/core-panels.ts",
    reason: "Reducer recognizes core-owned panel payloads while applying panel cards.",
  },
  {
    from: "src/reducer/reducer-panels.ts",
    to: "src/core/panel-renderers.ts",
    reason: "Reducer queries the existing panel renderer registry before storing panel state.",
  },
  {
    from: "src/reducer/reducer-session-ready.ts",
    to: "src/app/commands.ts",
    reason: "Reducer merges app-owned local command metadata into session-ready state.",
  },
] satisfies readonly FocusedImportAllowlistEntry[];

test("TUI owner directories only import through approved layer edges", () => {
  const imports = collectTuiOwnerImports();
  const violations = imports
    .filter((usage) => !isAllowedOwnerImport(usage))
    .map((usage) => {
      const allowedOwners = OWNER_IMPORT_RULES[usage.fromOwner]
        .map((rule) => `${rule.to} (${rule.reason})`)
        .join("; ") || "(none)";

      return [
        `${usage.fromOwner} must not import ${usage.toOwner} in ${usage.location}`,
        `  import: ${usage.specifier}`,
        `  allowed owner targets: ${allowedOwners}`,
      ].join("\n");
    });
  const actualImports = new Set(imports.map((usage) => `${usage.from}->${usage.to}`));
  const unusedAllowlistEntries = FOCUSED_IMPORT_ALLOWLIST
    .filter((entry) => !actualImports.has(`${entry.from}->${entry.to}`))
    .map((entry) => `${entry.from} -> ${entry.to}: ${entry.reason}`);

  expect(violations).toEqual([]);
  expect(unusedAllowlistEntries).toEqual([]);
});

type TuiOwnerImportUsage = {
  from: string;
  fromOwner: TuiOwnerDirectory;
  location: string;
  specifier: string;
  to: string;
  toOwner: TuiOwnerDirectory;
};

function isAllowedOwnerImport(usage: TuiOwnerImportUsage): boolean {
  if (usage.fromOwner === usage.toOwner) {
    return true;
  }

  if (OWNER_IMPORT_RULES[usage.fromOwner].some((rule) => rule.to === usage.toOwner)) {
    return true;
  }

  return FOCUSED_IMPORT_ALLOWLIST.some((entry) => entry.from === usage.from && entry.to === usage.to);
}

function collectTuiOwnerImports(): TuiOwnerImportUsage[] {
  const usages: TuiOwnerImportUsage[] = [];

  for (const path of listTypeScriptFilesIn(SRC_ROOT)) {
    const fromOwner = getOwnerDirectory(path);
    if (fromOwner === null) {
      continue;
    }

    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const addRelativeImport = (specifier: string, node: ts.Node): void => {
      const targetPath = resolveRelativeTypeScriptImport(path, specifier);
      if (targetPath === null) {
        return;
      }

      const toOwner = getOwnerDirectory(targetPath);
      if (toOwner === null || toOwner === fromOwner) {
        return;
      }

      usages.push({
        from: formatSourcePath(path),
        fromOwner,
        location: formatLocation(path, sourceFile, node.getStart(sourceFile)),
        specifier,
        to: formatSourcePath(targetPath),
        toOwner,
      });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        addRelativeImport(node.moduleSpecifier.text, node.moduleSpecifier);
      }

      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        addRelativeImport(node.moduleSpecifier.text, node.moduleSpecifier);
      }

      const importArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        importArgument !== undefined &&
        ts.isStringLiteralLike(importArgument)
      ) {
        addRelativeImport(importArgument.text, importArgument);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return usages.sort((left, right) => {
    return left.location.localeCompare(right.location) || left.to.localeCompare(right.to);
  });
}

function resolveRelativeTypeScriptImport(fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const candidates = [
    resolve(dirname(fromPath), specifier),
    `${resolve(dirname(fromPath), specifier)}.ts`,
    join(resolve(dirname(fromPath), specifier), "index.ts"),
  ];

  return candidates.find((candidate) => existsSync(candidate) && candidate.startsWith(SRC_ROOT)) ?? null;
}

function getOwnerDirectory(path: string): TuiOwnerDirectory | null {
  const relativePath = relative(SRC_ROOT, path).replaceAll("\\", "/");
  const owner = relativePath.split("/")[0];
  if (TUI_OWNER_DIRECTORIES.includes(owner as TuiOwnerDirectory)) {
    return owner as TuiOwnerDirectory;
  }

  return null;
}

function listTypeScriptFilesIn(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFilesIn(path));
      continue;
    }

    if (entry.isFile() && path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files.sort((left, right) => formatSourcePath(left).localeCompare(formatSourcePath(right)));
}

function formatSourcePath(path: string): string {
  return relative(PACKAGE_ROOT, path).replaceAll("\\", "/");
}

function formatLocation(path: string, sourceFile: ts.SourceFile, position: number): string {
  const { line } = sourceFile.getLineAndCharacterOfPosition(position);
  return `${formatSourcePath(path)}:${line + 1}`;
}
