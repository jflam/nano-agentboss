import { Container, type Component } from "./pi-tui.ts";
import type { UiState } from "./state.ts";
import type { NanobossTuiTheme } from "./theme.ts";
import {
  getChromeContributions,
  registerChromeContribution,
  type ChromeContribution,
  type ChromeRenderContext,
  type ChromeSlotId,
} from "./chrome.ts";
import { getPanelRenderer } from "./panel-renderers.ts";

// Side-effect imports: register every core chrome contribution and
// activity-bar segment into the module-level registries before any
// NanobossAppView instance iterates them.
import "./core-chrome.ts";
import "./core-activity-bar.ts";
import "./core-panels.ts";
import "./views-transcript.ts";

/**
 * Ordered list of chrome slots rendered by NanobossAppView. The composer
 * slot is rendered by the view itself (using the per-instance editor /
 * overlay composer); every other slot is driven by the registered
 * contributions in chrome.ts.
 */
const SLOT_ORDER: ChromeSlotId[] = [
  "header",
  "session",
  "status",
  "transcriptAbove",
  "transcript",
  "transcriptBelow",
  "composerAbove",
  "composer",
  "composerBelow",
  "activityBar",
  "overlay",
  "footer",
];

interface StatefulChild {
  setState(state: UiState): void;
}

class GatedComponent implements Component {
  constructor(
    private readonly inner: Component,
    private readonly gate: () => boolean,
  ) {}

  render(width: number): string[] {
    if (!this.gate()) {
      return [];
    }
    return this.inner.render(width);
  }

  invalidate(): void {
    this.inner.invalidate();
  }
}

export class NanobossAppView implements Component {
  private readonly container = new Container();
  private readonly composerContainer = new Container();
  private readonly statefulChildren: StatefulChild[] = [];
  private state: UiState;

  constructor(
    private readonly editor: Component,
    private readonly theme: NanobossTuiTheme,
    initialState: UiState,
    private readonly nowProvider: () => number = Date.now,
  ) {
    this.state = initialState;
    this.composerContainer.addChild(this.editor);

    const ctx: ChromeRenderContext = {
      state: this.state,
      theme: this.theme,
      getState: () => this.state,
      getNowMs: () => this.nowProvider(),
    };

    for (const slot of SLOT_ORDER) {
      if (slot === "composer") {
        this.container.addChild(this.composerContainer);
        continue;
      }
      for (const contribution of getChromeContributions(slot)) {
        this.mountContribution(contribution, ctx);
      }
    }

    // Give every stateful child the initial state snapshot so their
    // internal layout matches the constructor-time state exactly (this
    // mirrors the pre-migration behavior where TranscriptComponent was
    // seeded with the initial state during construction).
    for (const child of this.statefulChildren) {
      child.setState(this.state);
    }
  }

  private mountContribution(contribution: ChromeContribution, ctx: ChromeRenderContext): void {
    const component = contribution.render(ctx);
    const gated = contribution.shouldRender
      ? new GatedComponent(component, () => contribution.shouldRender!(this.state))
      : component;
    this.container.addChild(gated);
    const candidate = component as unknown as { setState?: (state: UiState) => void };
    if (typeof candidate.setState === "function") {
      const setState = candidate.setState.bind(component);
      this.statefulChildren.push({ setState: (state) => setState(state) });
    }
  }

  setState(state: UiState): void {
    this.state = state;
    for (const child of this.statefulChildren) {
      child.setState(state);
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    for (const child of this.statefulChildren) {
      child.setState(this.state);
    }
    this.container.invalidate();
  }

  showComposer(component: Component): void {
    this.composerContainer.clear();
    this.composerContainer.addChild(component);
    this.container.invalidate();
  }

  showEditor(): void {
    this.showComposer(this.editor);
  }
}

/**
 * Renders any panels registered via ui_panel events whose slot matches
 * this component's slot. Slot-specific contributions are registered
 * below for every non-transcript slot; the transcript slot materializes
 * nb/card@1 panels into turns at the reducer layer.
 */
class PanelsInSlotComponent implements Component {
  private readonly container = new Container();
  private readonly childComponents = new Set<Component>();
  private state: UiState;
  private lastKeys: string[] = [];

  constructor(
    private readonly theme: NanobossTuiTheme,
    private readonly slot: ChromeSlotId,
    initialState: UiState,
  ) {
    this.state = initialState;
    this.rebuild();
  }

  setState(state: UiState): void {
    this.state = state;
    this.rebuild();
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
    for (const child of this.childComponents) {
      child.invalidate();
    }
  }

  private rebuild(): void {
    const panels = this.state.panels.filter((panel) => panel.slot === this.slot);
    const keys = panels.map((panel) => `${panel.rendererId}::${panel.key ?? ""}`);
    const sameKeys = keys.length === this.lastKeys.length
      && keys.every((key, i) => key === this.lastKeys[i]);
    if (sameKeys && panels.length === this.childComponents.size) {
      return;
    }
    this.lastKeys = keys;
    this.container.clear();
    this.childComponents.clear();
    for (const panel of panels) {
      const renderer = getPanelRenderer(panel.rendererId);
      if (!renderer || !renderer.schema.validate(panel.payload)) {
        continue;
      }
      const component = renderer.render({
        payload: panel.payload,
        state: this.state,
        theme: this.theme,
      });
      this.childComponents.add(component);
      this.container.addChild(component);
    }
  }
}

const PANEL_HOST_SLOTS: ChromeSlotId[] = [
  "header",
  "session",
  "status",
  "transcriptAbove",
  "transcriptBelow",
  "composerAbove",
  "composerBelow",
  "activityBar",
  "overlay",
  "footer",
];

for (const slot of PANEL_HOST_SLOTS) {
  registerChromeContribution({
    id: `core.panels.${slot}`,
    slot,
    order: 1000,
    shouldRender: (state) => state.panels.some((panel) => panel.slot === slot),
    render: ({ getState, theme }) => new PanelsInSlotComponent(theme, slot, getState()),
  });
}
