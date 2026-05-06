export function shouldPrewarmDefaultAgentSession(): boolean {
  return process.env.NANOBOSS_PREWARM_DEFAULT_SESSION !== "0";
}
