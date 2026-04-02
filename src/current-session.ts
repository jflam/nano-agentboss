import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { getNanobossHome } from "./config.ts";

export interface CurrentSessionPointer {
  sessionId: string;
  cwd: string;
  rootDir: string;
  updatedAt: string;
}

export function getCurrentSessionPointerPath(): string {
  return `${getNanobossHome()}/current-session.json`;
}

export function writeCurrentSessionPointer(params: {
  sessionId: string;
  cwd: string;
  rootDir: string;
}): void {
  mkdirSync(getNanobossHome(), { recursive: true });
  writeFileSync(
    getCurrentSessionPointerPath(),
    `${JSON.stringify({
      sessionId: params.sessionId,
      cwd: params.cwd,
      rootDir: params.rootDir,
      updatedAt: new Date().toISOString(),
    } satisfies CurrentSessionPointer, null, 2)}\n`,
    "utf8",
  );
}

export function readCurrentSessionPointer(): CurrentSessionPointer | undefined {
  try {
    const raw = JSON.parse(readFileSync(getCurrentSessionPointerPath(), "utf8")) as Partial<CurrentSessionPointer>;
    if (
      typeof raw.sessionId !== "string" ||
      raw.sessionId.length === 0 ||
      typeof raw.cwd !== "string" ||
      raw.cwd.length === 0 ||
      typeof raw.rootDir !== "string" ||
      raw.rootDir.length === 0
    ) {
      return undefined;
    }

    return {
      sessionId: raw.sessionId,
      cwd: raw.cwd,
      rootDir: raw.rootDir,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return undefined;
  }
}
