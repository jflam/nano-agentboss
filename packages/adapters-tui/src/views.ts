import { Container, type Component } from "./pi-tui.ts";
import type { UiState } from "./state.ts";
import type { NanobossTuiTheme } from "./theme.ts";
import {
  getChromeContributions,
  type ChromeContribution,
  type ChromeRenderContext,
  type ChromeSlotId,
} from "./chrome.ts";

// Side-effect imports: register every core chrome contribution and
// activity-bar segment into the module-level registries before any
// NanobossAppView instance iterates them.
import "./core-chrome.ts";
import "./core-activity-bar.ts";
import "./core-panels.ts";
import "./views-transcript.ts";
import "./views-panels.ts";

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
