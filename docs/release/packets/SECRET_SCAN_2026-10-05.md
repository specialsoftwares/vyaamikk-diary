# Secret scan — GRIN candidate range

Scanner: **gitleaks 8.24.3** (downloaded release binary; not PATH-installed).
Manual `rg` is not this pass.

## Scope

| Item | Value |
|---|---|
| Repo | `/Users/shivamsaurav/vyd-worktrees/grin-combined` |
| Range | `0da2f58970f23c7ce6cbefae6efffd49c731f44b..HEAD` (`origin/main` merge-base → published combined) |
| `git rev-list --count` | 119 |
| Gitleaks “commits scanned” log | 91 (scanner’s count; may skip empty/non-text commits) |
| Bytes | ~2.88 MB |
| Report | `/tmp/gitleaks-grin-range.json` (not committed; may contain matcher snippets) |

Additional pass: gitleaks `--no-git` on `docs/release/**` working tree after
packet edits: **0 findings**.

Not in scope of this run: historical dirty workspace, `node_modules`, live GCP
secret values, EAS credentials, Play upload keystore.

## Findings

3 hits, all **gitleaks `generic-api-key`** on the TypeScript identifier
`G2AdmissionGate` in `tools/goods-evidence-storage/adapter.ts` (commit
`3ddd4f9`, lines 1052 / 1146 / 1169). That name is a **type alias**
(`"newCommands" | "reconciliation" | "retain"`), not a credential.
**No token, service-account JSON, private key, OTP, or customer
content was reported.**

This is not a clean-bill of the whole monorepo. It is a scanner pass of the
combined-vs-main commit range.
