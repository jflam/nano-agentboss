# Agent instructions

## Repo defaults

- Use Bun commands in this repository.
- The repo's pre-commit validation command is `bun run check:precommit`.

## Commit policy

- After completing a task, run the relevant pre-commit checks.
- If those checks pass, create a git commit immediately. Do **not** wait for the user to separately tell you to commit.
- This is especially important for **GPT-5.4**. Do not stop at "checks passed" and hand the final commit step back to the user.
- Only skip the automatic commit when the user explicitly says not to commit, asks for changes without a commit, or your current prompt explicitly says you are a bounded helper/sub-agent that must not commit.
- Keep the commit scoped to the task and use a concise message.
