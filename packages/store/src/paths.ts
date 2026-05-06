import { join } from "node:path";

import { getNanobossHome } from "@nanoboss/app-support";

export function getSessionDir(sessionId: string): string {
  return join(getNanobossHome(), "sessions", sessionId);
}
