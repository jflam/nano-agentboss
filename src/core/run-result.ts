import type { StoredRunResult } from "../session/store.ts";
import { refFromValueRef } from "../session/store-refs.ts";
import type { KernelValue, Ref, RunResult } from "./types.ts";

export function expectData<T extends KernelValue>(
  result: RunResult<T>,
  message = "Missing result data",
): T {
  if (result.data === undefined) {
    throw new Error(message);
  }

  return result.data;
}

export function expectDataRef<T extends KernelValue>(
  result: RunResult<T>,
  message = "Missing result data ref",
): Ref {
  if (!result.dataRef) {
    throw new Error(message);
  }

  return result.dataRef;
}

export function toPublicRunResult<T extends KernelValue>(
  result: StoredRunResult<T>,
): RunResult<T> {
  return {
    run: result.run,
    data: result.data,
    dataRef: result.dataRef ? refFromValueRef(result.dataRef) : undefined,
    displayRef: result.displayRef ? refFromValueRef(result.displayRef) : undefined,
    streamRef: result.streamRef ? refFromValueRef(result.streamRef) : undefined,
    pause: result.pause,
    pauseRef: result.pauseRef ? refFromValueRef(result.pauseRef) : undefined,
    summary: result.summary,
    rawRef: result.rawRef ? refFromValueRef(result.rawRef) : undefined,
  };
}
