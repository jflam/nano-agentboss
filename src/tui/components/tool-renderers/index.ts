import type { UiToolCall } from "../../state.ts";
import type { NanobossTuiTheme } from "../../theme.ts";
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

export function renderToolCard(theme: NanobossTuiTheme, toolCall: UiToolCall, expanded: boolean): RenderedToolCard {
  switch (normalizeToolName(toolCall)) {
    case "bash":
      return renderBashToolCard(theme, toolCall, expanded);
    case "read":
      return renderReadToolCard(theme, toolCall, expanded);
    case "edit":
      return renderEditToolCard(theme, toolCall, expanded);
    case "write":
      return renderWriteToolCard(theme, toolCall, expanded);
    case "grep":
      return renderGrepToolCard(theme, toolCall, expanded);
    case "find":
      return renderFindToolCard(theme, toolCall, expanded);
    case "ls":
      return renderLsToolCard(theme, toolCall, expanded);
    default:
      return renderFallbackToolCard(theme, toolCall, expanded);
  }
}
