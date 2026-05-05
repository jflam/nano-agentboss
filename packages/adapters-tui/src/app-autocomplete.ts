import {
  type AutocompleteItem,
  CombinedAutocompleteProvider,
} from "./pi-tui.ts";

export class NanobossAutocompleteProvider extends CombinedAutocompleteProvider {
  override applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): {
    lines: string[];
    cursorLine: number;
    cursorCol: number;
  } {
    if (prefix.startsWith("/")) {
      const currentLine = lines[cursorLine] ?? "";
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      if (beforePrefix.trim() === "") {
        const completedLines = [...lines];
        completedLines[cursorLine] = `${beforePrefix}/${item.value} ${currentLine.slice(cursorCol)}`;
        return {
          lines: completedLines,
          cursorLine,
          cursorCol: beforePrefix.length + item.value.length + 2,
        };
      }
    }

    return super.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }
}
