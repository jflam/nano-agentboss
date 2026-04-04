export function shouldLoadDiskCommands(): boolean {
  return Bun.env.NANOBOSS_LOAD_DISK_COMMANDS !== "0";
}
