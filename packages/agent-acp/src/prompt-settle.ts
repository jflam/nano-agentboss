export async function waitForSettledUpdateQueue(
  getLastTask: () => Promise<void>,
): Promise<void> {
  const settleMs = getPromptSettleMs();
  for (;;) {
    const currentTask = getLastTask();
    await currentTask;
    await Bun.sleep(settleMs);
    if (getLastTask() === currentTask) {
      return;
    }
  }
}

function getPromptSettleMs(): number {
  const value = Number(process.env.NANOBOSS_ACP_PROMPT_SETTLE_MS ?? "50");
  return Number.isFinite(value) && value >= 0 ? value : 50;
}
