import type {
  ActivityBarSegment as SdkActivityBarSegment,
} from "@nanoboss/tui-extension-sdk";
import type { UiState } from "../state/state.ts";
import type { NanobossTuiTheme } from "../theme/theme.ts";

export type ActivityBarSegment =
  SdkActivityBarSegment<UiState, NanobossTuiTheme>;
