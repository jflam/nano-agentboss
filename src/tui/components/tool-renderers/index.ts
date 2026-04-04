import type { UiToolCall } from "../../state.ts";
import type { RenderedToolCard } from "../tool-card-format.ts";
import { normalizeToolName } from "../tool-card-format.ts";

import { renderBashToolCard } from "./bash.ts";
import { renderEditToolCard } from "./edit.ts";
import { renderFallbackToolCard } from "./fallback.ts";
import { renderFindToolCard } from "./find.ts";
import { renderGrepToolCard } from "./grep.ts";
import { renderLsToolCard } from "./ls.ts";
import { renderReadToolCard } from "./read.ts";
import { renderWriteToolCard } from "./write.ts";

export function renderToolCard(toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  switch (normalizeToolName(toolCall)) {
    case "bash":
      return renderBashToolCard(toolCall, expanded);
    case "read":
      return renderReadToolCard(toolCall, expanded);
    case "edit":
      return renderEditToolCard(toolCall, expanded);
    case "write":
      return renderWriteToolCard(toolCall, expanded);
    case "grep":
      return renderGrepToolCard(toolCall, expanded);
    case "find":
      return renderFindToolCard(toolCall, expanded);
    case "ls":
      return renderLsToolCard(toolCall, expanded);
    default:
      return renderFallbackToolCard(toolCall, expanded);
  }
}
