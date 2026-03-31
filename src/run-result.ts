import type { KernelValue, RunResult, ValueRef } from "./types.ts";

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
): ValueRef {
  if (!result.dataRef) {
    throw new Error(message);
  }

  return result.dataRef;
}
