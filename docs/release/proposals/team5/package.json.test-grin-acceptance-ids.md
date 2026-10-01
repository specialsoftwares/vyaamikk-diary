# Team 5 proposal: `package.json` script (coordinator-owned)

Do **not** apply from this branch as a silent production change. Coordinator owns `package.json`.

Add:

```json
"test:grin-acceptance-ids": "npx --yes tsx tools/grin-acceptance/runIds.ts"
```

Notes:

- Wave 1 suite only asserts matrix IDs exist. It does not execute combined workflows.
- Do not fold emulator combined scenarios into `ci:verify` until Wave 2 fills them.
- Do not add this script if the coordinator prefers to wait; `npx tsx tools/grin-acceptance/runIds.ts` is runnable from the worktree without the script.

Team 5 did not edit `package.json` or `scripts/ci/run-all-tests.mjs` on `team/grin-t5-qa`.
