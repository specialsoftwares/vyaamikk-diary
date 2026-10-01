# tools/grin-acceptance

Team 5 Wave 1 scaffold. Combined GRIN workflows are **not** executed here.

## What greens mean

`npx --yes tsx tools/grin-acceptance/runIds.ts` passing means every matrix ID in `docs/release/GRIN_ACCEPTANCE_MATRIX.md` exists and `NATIVE_DEVICE` / `PLAY_INSTALLED` rows are still pending. It does **not** mean CS-01…CS-11 passed.

## Layout

| Path | Role |
|---|---|
| `matrixIds.ts` | ID catalogue (must match the matrix tables) |
| `parseMatrix.ts` | Parses six-column requirement rows |
| `matrix.ids.test.ts` | Set equality + pending-label invariants |
| `scenarios/cs*.test.ts` | Per combined-scenario stubs (Wave 2 fill) |
| `security/security.rows.test.ts` | SEC-* stubs |
| `device/` | Native/Play pending scripts + evidence envelope |
| `runIds.ts` | Runs the Wave 1 id stubs |

Coordinator-owned `package.json` is not edited. Proposal: `docs/release/proposals/team5/package.json.test-grin-acceptance-ids.md`.

Device scripts exit 2 with `device_pending` / `play_pending`. They refuse EAS, Play, and firebase deploy.
