import typia from "typia";

import { jsonType, type UiCardKind } from "@nanoboss/procedure-sdk";

import { MessageCardComponent } from "./components/message-card.ts";
import type { Component } from "./pi-tui.ts";
import { registerPanelRenderer } from "./panel-renderers.ts";

/**
 * Payload shape accepted by the core nb/card@1 renderer. The kind is
 * intentionally widened to a string so third-party authors can coin new
 * kinds; the core renderer falls back to an "info" tone for anything it
 * does not recognize.
 */
export interface NbCardV1Payload {
  kind: UiCardKind | string;
  title?: string;
  markdown: string;
}

const NbCardV1PayloadType = jsonType<NbCardV1Payload>(
  typia.json.schema<NbCardV1Payload>(),
  typia.createValidate<NbCardV1Payload>(),
);

export type NbCardTone = "info" | "success" | "warning" | "error";

export function nbCardV1Tone(kind: string): NbCardTone {
  switch (kind) {
    case "summary":
      return "success";
    case "checkpoint":
      return "warning";
    default:
      return "info";
  }
}

export function renderNbCardV1Markdown(payload: NbCardV1Payload): string {
  const title = payload.title ?? "";
  return [
    `## ${title}`,
    "",
    `_${payload.kind}_`,
    "",
    payload.markdown.trim(),
  ]
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .join("\n");
}

registerPanelRenderer<NbCardV1Payload>({
  rendererId: "nb/card@1",
  schema: NbCardV1PayloadType,
  render({ payload, theme }): Component {
    const markdown = renderNbCardV1Markdown(payload);
    const lines = markdown.length === 0 ? ["…"] : markdown.split("\n");
    return new MessageCardComponent(theme, lines, nbCardV1Tone(payload.kind));
  },
});

/**
 * Error panel payload rendered for run_failed procedure panels so resume
 * errors remain visible regardless of the tool-card toggle.
 */
interface NbErrorV1Payload {
  procedure: string;
  message: string;
}

const NbErrorV1PayloadType = jsonType<NbErrorV1Payload>(
  typia.json.schema<NbErrorV1Payload>(),
  typia.createValidate<NbErrorV1Payload>(),
);

registerPanelRenderer<NbErrorV1Payload>({
  rendererId: "nb/error@1",
  schema: NbErrorV1PayloadType,
  render({ payload, theme }): Component {
    const lines = [
      `/${payload.procedure}`,
      "",
      `Error: ${payload.message}`,
    ];
    return new MessageCardComponent(theme, lines, "error");
  },
});

interface NbNoticeV1Payload {
  message: string;
  severity: "info" | "warn" | "error";
}

const NbNoticeV1PayloadType = jsonType<NbNoticeV1Payload>(
  typia.json.schema<NbNoticeV1Payload>(),
  typia.createValidate<NbNoticeV1Payload>(),
);

registerPanelRenderer<NbNoticeV1Payload>({
  rendererId: "nb/notice@1",
  schema: NbNoticeV1PayloadType,
  render({ payload, theme }): Component {
    const tone = payload.severity === "warn"
      ? "warning"
      : payload.severity;
    const lines = payload.message.length === 0 ? ["…"] : payload.message.split("\n");
    return new MessageCardComponent(theme, lines, tone);
  },
});
