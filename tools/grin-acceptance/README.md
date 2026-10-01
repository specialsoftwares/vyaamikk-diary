# tools/grin-acceptance

Team 5 owned QA harness. Not production. Not G6 completion.

## Two runners (do not confuse them)

| Command | What a green exit means |
|---|---|
| `npx --yes tsx tools/grin-acceptance/runIds.ts` | Every matrix ID in `docs/release/GRIN_ACCEPTANCE_MATRIX.md` exists. **Not** CS-01…CS-11 workflow evidence. |
| `npx --yes tsx tools/grin-acceptance/runWorkflows.ts` | ER-4 SQLITE_HOST v9→v10 GRIN-off QA plus the CS slices listed in `docs/release/proposals/team5/WAVE2_ER45.md`. Still **not** a matrix status of complete/accepted/pass/done/approved. Still **not** NATIVE_DEVICE. |

`tools/grin-acceptance/scenarios/cs*.test.ts` stay ID-presence stubs imported by `runIds.ts`. Real CS work lives under `workflows/` and `startup/`.

## Layout

| Path | Role |
|---|---|
| `matrixIds.ts` | ID catalogue (must match the matrix tables) |
| `parseMatrix.ts` | Parses six-column requirement rows |
| `matrix.ids.test.ts` | Set equality + pending-label invariants |
| `scenarios/cs*.test.ts` | Per-ID presence stubs for `runIds.ts` |
| `startup/v9-v10-grin-off.sqliteHost.test.ts` | ER-4 GRIN-off v9→v10 SQLITE_HOST QA |
| `workflows/` | ER-5 CS executions; CS-01 runs Team 3 `npm run test:grin-interop` (not duplicated); CS-02 runs Team 2 `createInjectedGrinEvidencePort` + existing `npm run test:goods-evidence-g2-unit` (adapter not copied) |
| `runWorkflows.ts` | Runs ER-4 + CS workflow files |
| `security/security.rows.test.ts` | SEC-* ID stubs |
| `device/` | Native/Play pending scripts + evidence envelope |
| `runIds.ts` | ID-presence only |

Coordinator-owned `package.json` is not edited here. `test:grin-acceptance-ids` remains ID-presence.

Device scripts exit 2 with `device_pending` / `play_pending`. They refuse EAS, Play, and firebase deploy.
