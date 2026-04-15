import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function writeTextFileAtomicSync(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, content, "utf8");
  renameSync(tempPath, path);
}

export function writeJsonFileAtomicSync(path: string, value: unknown): void {
  writeTextFileAtomicSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
