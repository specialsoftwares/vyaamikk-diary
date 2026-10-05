# Unapplied — additive GRIN Rules (freshness)

Do **not** deploy. Keep this artifact separate from repo-root quota
`firestore.rules` (`233b05b7…`).

## Live re-export (2026-10-06)

After owner `firebase login --reauth` as `support.vyd@specialsoftwares.com`,
read-only export landed in
`docs/release/rules-compat/live-export-2026-10-06/`.

| Surface | sha256 | vs approved baseline |
|---|---|---|
| Live Firestore | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` | match |
| Live Storage | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` | match |

No drift. Merged proposed-grin files remain valid against this live base.
Isolated config:
`docs/release/rules-compat/proposed-grin/firebase.rules-only.json`.
Do not deploy repo-root quota Firestore. Rollback artifacts are this
directory, not a hardcoded October 1 ruleset ID.

## Matcher sources (emulator / proposal copies, not live)

- Firestore GRIN matchers: `tools/goods-evidence-emulator/functions-entry/firestore.rules`
- Storage GRIN matchers: `tools/goods-evidence-storage/storage.rules`
