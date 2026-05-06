import type { ClipboardImageProvider } from "./types.ts";

export function createUnsupportedClipboardImageProvider(): ClipboardImageProvider {
  return {
    async readImage() {
      return undefined;
    },
  };
}
