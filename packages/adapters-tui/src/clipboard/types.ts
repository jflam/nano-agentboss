import type { ClipboardImage } from "../app/composer.ts";

export interface ClipboardImageProvider {
  readImage(): Promise<ClipboardImage | undefined>;
}
