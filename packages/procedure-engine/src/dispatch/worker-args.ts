export function parseProcedureDispatchWorkerArgs(argv: string[]): {
  sessionId: string;
  cwd: string;
  rootDir: string;
  dispatchId: string;
} {
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let rootDir: string | undefined;
  let dispatchId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--session-id":
        sessionId = requireWorkerArgValue(next, "--session-id");
        index += 1;
        break;
      case "--cwd":
        cwd = requireWorkerArgValue(next, "--cwd");
        index += 1;
        break;
      case "--root-dir":
        rootDir = requireWorkerArgValue(next, "--root-dir");
        index += 1;
        break;
      case "--dispatch-id":
        dispatchId = requireWorkerArgValue(next, "--dispatch-id");
        index += 1;
        break;
      default:
        throw new Error(`Unknown procedure-dispatch-worker arg: ${arg}`);
    }
  }

  if (!sessionId) {
    throw new Error("Missing required arg: --session-id");
  }

  if (!cwd) {
    throw new Error("Missing required arg: --cwd");
  }

  if (!rootDir) {
    throw new Error("Missing required arg: --root-dir");
  }

  if (!dispatchId) {
    throw new Error("Missing required arg: --dispatch-id");
  }

  return { sessionId, cwd, rootDir, dispatchId };
}

function requireWorkerArgValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}
