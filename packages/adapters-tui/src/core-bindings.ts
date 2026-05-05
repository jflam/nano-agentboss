import { registerKeyBinding, type KeyBinding } from "./bindings.ts";
import { buildKeybindingsHelpMarkdown } from "./core-bindings-help.ts";

/**
 * Core bindings shipped with @nanoboss/adapters-tui. Registered for side
 * effects when this module is imported. Each binding's `run` delegates to
 * controller/app hooks surfaced through BindingCtx so registrations stay
 * free of instance state.
 */

const CORE_BINDINGS: KeyBinding[] = [
  // send/compose — enter and shift+enter are consumed by the pi-tui
  // Editor itself; we register them as docs-only so the overlay can list
  // them without re-implementing editor behavior.
  {
    id: "compose.submit",
    category: "compose",
    label: "enter send",
    order: 0,
  },
  {
    id: "compose.newline",
    category: "compose",
    label: "shift+enter newline",
    order: 1,
  },

  // tools
  {
    id: "tools.toggleOutput",
    category: "tools",
    match: "ctrl+o",
    label: "ctrl+o expand tool output",
    order: 0,
    run: ({ app }) => {
      app.handleCtrlOWithCooldown();
      return { consume: true };
    },
  },

  // run control
  {
    id: "run.toggleAutoApprove",
    category: "run",
    match: "ctrl+g",
    label: "ctrl+g auto-approve",
    order: 0,
    run: ({ controller }) => {
      controller.toggleSimplify2AutoApprove();
      return { consume: true };
    },
  },
  {
    id: "run.togglePause",
    category: "run",
    match: "ctrl+p",
    label: "ctrl+p pause",
    order: 1,
    run: ({ app }) => {
      app.toggleLiveUpdatesPaused();
      return { consume: true };
    },
  },
  {
    id: "run.toggleToolCards",
    category: "run",
    match: "ctrl+t",
    label: "ctrl+t hide tool cards",
    order: 2,
    run: ({ controller }) => {
      controller.toggleToolCardsHidden();
      return { consume: true };
    },
  },
  {
    id: "run.stop",
    category: "run",
    match: "escape",
    label: "esc stop",
    order: 3,
    when: (state) => state.inputDisabledReason === "run",
    run: ({ controller, state }) => {
      if (state.inputDisabledReason === "run") {
        void controller.cancelActiveRun();
        return { consume: true };
      }
      return undefined;
    },
  },
  {
    id: "run.queue",
    category: "run",
    match: "tab",
    label: "tab queue",
    order: 4,
    when: (state) => state.inputDisabledReason === "run",
    run: ({ app }) => {
      return app.handleTabQueue() ? { consume: true } : { consume: false };
    },
  },

  // theme — slash commands, docs-only in the overlay.
  {
    id: "theme.light",
    category: "theme",
    label: "/light",
    order: 0,
  },
  {
    id: "theme.dark",
    category: "theme",
    label: "/dark",
    order: 1,
  },

  // commands — slash commands, docs-only in the overlay.
  {
    id: "commands.new",
    category: "commands",
    label: "/new",
    order: 0,
  },
  {
    id: "commands.model",
    category: "commands",
    label: "/model",
    order: 1,
  },
  {
    id: "commands.help",
    category: "commands",
    label: "/help",
    order: 2,
  },
  {
    id: "commands.quit",
    category: "commands",
    label: "/quit",
    order: 3,
  },
  {
    id: "commands.dismiss",
    category: "commands",
    label: "/dismiss",
    order: 4,
  },

  // overlay
  {
    id: "overlay.toggle",
    category: "overlay",
    match: "ctrl+h",
    label: "ctrl+h keys",
    order: 0,
    run: ({ controller }) => {
      controller.showLocalCard({
        title: "Keybindings",
        markdown: buildKeybindingsHelpMarkdown(),
        severity: "info",
      });
      return { consume: true };
    },
  },

  // custom — clipboard paste and ctrl+c exit are not user-facing "keys"
  // entries in the overlay today; they live under the "custom" category
  // but remain dispatched through the registry.
  {
    id: "custom.clipboardPaste",
    category: "custom",
    match: "ctrl+v",
    label: "ctrl+v paste image",
    order: 0,
    run: ({ app }) => {
      void app.handleCtrlVImagePaste();
      return { consume: true };
    },
  },
  {
    id: "custom.ctrlCExit",
    category: "custom",
    match: "ctrl+c",
    label: "ctrl+c clear / exit",
    order: 1,
    run: ({ app }) => {
      app.handleCtrlC();
      return { consume: true };
    },
  },
];

for (const binding of CORE_BINDINGS) {
  registerKeyBinding(binding);
}
