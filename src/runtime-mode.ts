export function isCompiledRuntime(): boolean {
  const scriptPath = process.argv[1];
  return !scriptPath || !/\.[cm]?[jt]sx?$/i.test(scriptPath);
}

export function shouldLoadDiskCommands(): boolean {
  return Bun.env.NANOBOSS_LOAD_DISK_COMMANDS === "1";
}
