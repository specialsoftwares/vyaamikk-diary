# Wave 1 GRIN scope scan (Team 5)

Honest findings for **SEC-05**. This is not a clean bill, not G6 completion, and not a substitute for a later scanner on G2–G5 diffs.

Scope scanned on this worktree (`team/grin-t5-qa` at Wave 1 docs HEAD): `src/goodsEvidence/**`, `tools/goods-evidence-emulator/**`, `docs/release/GRIN_*.md`, `docs/release/proposals/team5/**`, `tools/grin-acceptance/**`.

## Secrets / credentials

- No `.env` (non-example), service-account JSON, or keystore files in the scanned trees.
- G1 emulator project id is `demo-vyaamikk-grin-g1` (demo emulator, not production).
- `tools/goods-evidence-emulator/log.ts` allowlists `code`, `attempt`, `replayed`, `policy` only.
- Production `firestore.rules` / `storage.rules` were not modified on this branch.

Residual risk: G2–G5 source is not on this branch; scan must be repeated on the combined diffs. `GrinDeny.detail` can still carry business-shaped strings even when logs are allowlisted.

## Dependencies

- This Wave 1 change adds no npm dependencies.
- `npm audit` was not run as a G6 gate and is not claimed here.
- G1 emulator continues to use Node `crypto` for hashes (packaging-safe) while domain `command.ts` / `hashChain.ts` still import `@/utils/sha256Hex` (Functions packaging conflict; see contract review).

## Rules / production fallback

- Isolated G1 Rules file denies client writes to GRIN paths (`allow create, update, delete: if false`).
- Emulator config does not point at the production Firebase project.
- No Team 5 change relaxes live Rules.

## Follow-up (other teams)

- Repeat secret scan when `functions/src/goodsEvidence/**`, Storage paths, and SQLite outbox land.
- Bind G2 logs to the same allowlist pattern before claiming SEC-04.
