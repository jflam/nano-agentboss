import type { TypeDescriptor } from "@nanoboss/procedure-sdk";

import type { Component } from "./pi-tui.ts";
import type { UiState } from "./state.ts";
import type { NanobossTuiTheme } from "./theme.ts";

/**
 * Per-renderer context handed to PanelRenderer.render. The payload has
 * already been validated against the renderer's schema by the reducer
 * before the view layer calls into this function.
 */
export interface PanelRenderContext<T> {
  payload: T;
  state: UiState;
  theme: NanobossTuiTheme;
}

/**
 * A registered panel renderer. Renderer ids are the public contract
 * procedures target via ui.panel({ rendererId, ... }); schemas are
 * typia-backed via the shared jsonType(...) pattern.
 */
export interface PanelRenderer<T = unknown> {
  rendererId: string;
  schema: TypeDescriptor<T>;
  render(ctx: PanelRenderContext<T>): Component;
}

const registry = new Map<string, PanelRenderer<unknown>>();

export function registerPanelRenderer<T>(renderer: PanelRenderer<T>): void {
  if (registry.has(renderer.rendererId)) {
    throw new Error(`panel renderer already registered: ${renderer.rendererId}`);
  }
  registry.set(renderer.rendererId, renderer as PanelRenderer<unknown>);
}

/**
 * Remove a previously-registered panel renderer. Exposed for the TUI
 * extension boot layer so a higher-precedence extension (repo/profile) can
 * shadow a renderer contributed by a lower-precedence extension (builtin).
 * Returns true if a renderer was removed, false otherwise.
 */
export function unregisterPanelRenderer(rendererId: string): boolean {
  return registry.delete(rendererId);
}

export function getPanelRenderer(rendererId: string): PanelRenderer<unknown> | undefined {
  return registry.get(rendererId);
}

export function listPanelRenderers(): PanelRenderer<unknown>[] {
  return Array.from(registry.values());
}
