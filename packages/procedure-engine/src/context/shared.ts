import type * as acp from "@agentclientprotocol/sdk";

import type { PromptInput } from "../../../../src/core/types.ts";
import type { UiCardParams, UiStatusParams } from "../../../../src/core/types.ts";

export type ProcedureUiEvent =
  | {
      type: "status";
      procedure: string;
    } & Omit<UiStatusParams, "procedure">
  | {
      type: "card";
      procedure: string;
    } & UiCardParams;

export interface SessionUpdateEmitter {
  emit(update: acp.SessionUpdate): void;
  emitUiEvent?(event: ProcedureUiEvent): void;
  flush(): Promise<void>;
}

export interface PreparedDefaultPrompt {
  promptInput: PromptInput;
  markSubmitted?: () => void;
}
