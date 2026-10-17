# Admin project/bucket resolution review (Team 5)

AI QA / release-gate role, not human certification. Independent of the
implementation pass. **Wave 2 is not accepted.** Not live deploy. Not G6.

Application SHA: `4aac867af015d83f6ec3badb0748ff3b4bcc1a22`.
Parent packaging SHA: `84c748d026d4229cded55d3ddc281a15858322c9`.
Confirmation-refresh `dcc325a` was **not** reopened.

## What was executed

| Check | Host | Result |
|---|---|---|
| `git show 84c748d:functions/src/goodsEvidence/productionCompose.ts` | source | OLD `ensureAdminApp` confirmed: demo fallback, guessed `${projectId}.appspot.com`, no `FIREBASE_CONFIG.storageBucket`, no existing-app bucket |
| Inline copy of OLD 3-line algorithm vs CURRENT `resolveGrinAdminBinding` / `createProductionGrinCallables` with injected Admin ports | INJECTED | OLD returned `vyaamikk-diary.appspot.com`; NEW returned `vyaamikk-diary.firebasestorage.app` on the same `[DEFAULT]` app |
| Existing default app already holding `firebasestorage.app` | INJECTED | OLD still guessed `.appspot.com`; NEW reused the existing app (`initialized=false`) |
| Missing config / emulator hosts without `GRIN_ADMIN_*` | INJECTED | NEW `grin_admin_config_missing` — **not** `demo-vyaamikk-grin-t1` |
| Named apps only; conflicting existing app; explicit `.appspot.com` override | INJECTED | no-default / conflict / explicit legacy bucket allowed |
| `production-admin-config.injected.unit.test.ts` | INJECTED | exit 0 |
| `test:goods-evidence-g1-unit` + `functions` `tsc` + isolated Functions emulator (roundtrip + pack-complete + gates) | INJECTED / EMULATOR | exit 0 |
| Live Firebase / emulator GCP | — | **not run** |

## Reproduced env (before / after)

`GCLOUD_PROJECT=vyaamikk-diary` and Firebase runtime JSON with
`projectId=vyaamikk-diary`, `storageBucket=vyaamikk-diary.firebasestorage.app`.

| | projectId | storageBucket |
|---|---|---|
| OLD | `vyaamikk-diary` | `vyaamikk-diary.appspot.com` |
| NEW | `vyaamikk-diary` | `vyaamikk-diary.firebasestorage.app` |

Firestore and Storage ports received the **same** selected `[DEFAULT]` app.
NEW does not print `FIREBASE_CONFIG` or process env; diagnostics are fixed codes.

## HOLDs still in force

- `functions/src/index.ts` has no GRIN export.
- `newCommands=deny` still blocks G1 `grinReadGoodsReceipt`. Retained Storage
  GET alone does not mean the app can read/export records.
- No live Rules/IAM/config write. Firebase reauth remains a separate
  operational prerequisite.

## Bounded verdict

**Config correction accepted at injected-port evidence.** Not a live backend,
not device acceptance, not Wave 2 / G6. Remaining owner boundary: push this
correction to PR #31, record **new** canonical CI (do not reuse
`37330701057`), then separately authorize seven-export after reauth.
