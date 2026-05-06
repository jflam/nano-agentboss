# Agent instructions

## Validation policy

- Use Bun commands in this repository.
- The repo's pre-commit validation command is `bun run check:precommit`.
- Do not run tests while only reading, searching, or planning.
- Do not run code tests for docs-only or plans-only edits.
- Do not run `bun run check:precommit` in the middle of implementation work.
- For implementation checkpoints, run `bun run validate:changed`.
- Use direct package/test-file commands only when narrowing a failure.
- Before committing code, tests, package manifests, build scripts, or validation
  infrastructure, run `bun run check:precommit`.
- For docs-only or plans-only commits, skip `bun run check:precommit` unless the
  user explicitly requests it or a docs validation command exists for the edited
  files.
- If `bun run check:precommit` passes, create the commit immediately.

## Commit policy

- After completing a task, run the relevant pre-commit checks under the
  validation policy above.
- If those checks pass, create a git commit immediately. Do **not** wait for the user to separately tell you to commit.
- This is especially important for **GPT-5.4**. Do not stop at "checks passed" and hand the final commit step back to the user.
- Only skip the automatic commit when the user explicitly says not to commit, asks for changes without a commit, or your current prompt explicitly says you are a bounded helper/sub-agent that must not commit.
- Keep the commit scoped to the task and use a concise message.
