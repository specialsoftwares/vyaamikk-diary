# GRIN file ownership — one owner per shared file

Propose changes to the owner. Do not edit another team’s files in the same commit.
Put proposals under `docs/release/proposals/<team>/`.

| Path | Owner | Notes |
|---|---|---|
| `docs/release/GRIN_INTERFACE_CONTRACT.md` | coordinator | |
| `docs/release/GRIN_FILE_OWNERSHIP.md` | coordinator | |
| `docs/release/packets/**` | coordinator | undeployed review packets A–E; not live deploy |
| `docs/release/GRIN_TEAM_BOARD.md` | coordinator | |
| `docs/release/GRIN_IMPLEMENTATION_REGISTER.md` | coordinator | |
| `docs/release/GRIN_ACCEPTANCE_MATRIX.md` | team5 | created by Team 5 |
| `src/goodsEvidence/ports.ts` | coordinator | shared types |
| `src/goodsEvidence/index.ts` | coordinator | public exports only |
| `src/goodsEvidence/types.ts` | coordinator | event/view/original shapes; teams propose new event types |
| `src/goodsEvidence/constants.ts` | coordinator | |
| `src/goodsEvidence/featureFlag.ts` | coordinator | stays default-off |
| `package.json` / `package-lock.json` | coordinator | teams propose scripts |
| `.github/workflows/ci.yml` | coordinator | verify-only; no deploy |
| `functions/src/index.ts` | coordinator | fail-closed exports; Team 1 proposes |
| `functions/package.json` / `functions/tsconfig.json` | coordinator | no rootDir lift that moves `lib/index.js` |
| `app/(app)/_layout.tsx` | coordinator | stack already auto-discovers; extra wiring here if needed |
| `app/(app)/(tabs)/saved-records.tsx` | coordinator | GRIN hub tile, gated |
| `tools/goods-evidence-emulator/**` | team1 | G1 adapter + mutation emulator |
| `functions/src/goodsEvidence/**` | team1 | generated/packaged domain + fail-closed callables |
| `src/services/grin/transport/**` | team1 | mobile-safe httpsCallable-style client; no firebase-admin / HostSqlite / emulator imports |
| `src/goodsEvidence/command.ts` | team1 | |
| `src/goodsEvidence/validate.ts` | team1 | |
| `src/goodsEvidence/canonical.ts` | team1 | omit-undefined is the contract; keep behaviour |
| `src/goodsEvidence/ledger.ts` | team1 | remains labelled simulation |
| `src/goodsEvidence/quantities.ts` | team1 | |
| `src/goodsEvidence/ewb.ts` | team1 | |
| `src/goodsEvidence/hashChain.ts` | team1 | |
| `src/goodsEvidence/snapshot.ts` | team1 | |
| `src/goodsEvidence/custody.ts` | team1 | |
| `src/goodsEvidence/grinNumber.ts` | team1 | |
| `src/goodsEvidence/time.ts` | team1 | |
| `src/goodsEvidence/evidence.ts` | team2 | |
| `src/goodsEvidence/boundedRead.ts` | team2 | platform-free FileHandle iterator; production Expo adapter stays in Team 4 retention |
| `src/goodsEvidence/evidenceSupport.ts` | team2 | policy v2; do not weaken |
| `tools/goods-evidence-storage/**` | team2 | new Storage emulator harness |
| `docs/release/proposals/team1/firestore.rules.grin.md` | team1 | proposal only; do not edit live `firestore.rules` |
| `docs/release/proposals/team2/storage.rules.grin.md` | team2 | proposal only; do not edit live `storage.rules` |
| `src/services/grin/outbox/**` | team3 | |
| `src/localDb/migrateGrin.ts` | team3 | v10 tables |
| `src/goodsEvidence/offline.ts` | team3 | keep simulation notice; real outbox is not this file |
| `src/localDb/init.ts` | coordinator | Calls `applyPendingLocalMigrations`; Team 3 proposes GRIN repairs |
| `src/localDb/applyPendingMigrations.ts` | coordinator | Production v1–v10 orchestrator; tests must call this, not a copied sequence |
| `src/localDb/schema.ts` | coordinator | `DB_VERSION` bump via Team 3 proposal |
| `app/(app)/grin/**` | team4 | screens |
| `src/screens/grin/**` | team4 | if used |
| `src/services/grin/pdf/**` | team4 | adapters; reuse `pdfGenerateHook` / pdfService |
| `src/goodsEvidence/evidencePack.ts` | team4 | completeness model already exists |
| `src/goodsEvidence/exceptions.ts` | team4 | |
| `src/i18n/locales/*.json` | team4 | all locales, `grin.*` keys; keep key consistency |
| `src/services/grin/repository/**` | team4 | Wave 2 app repository; must not ship FAKE counts as production |
| `tools/grin-interop/**` | team3 | SQLITE_HOST + INJECTED G1/G2 interop tests; propose `package.json` script |
| `tools/grin-acceptance/**` | team5 | combined scenarios |
| `docs/release/GRIN_DEVICE_CHECKLIST.md` | team5 | pending native |
| `docs/release/proposals/team5/**` | team5 | review notes |

Team 5 does not own production implementations. A Team 5 code fix needs another team’s review.

Do not share `node_modules` symlinks across worktrees.
Emulator ports: Team 1 Firestore **8090**; Team 2 Firestore **8091** + Storage **9200**; G1 historical **8088** remains for existing tests until coordinator unifies.
Isolated Functions-emulator GRIN entrypoint: `tools/goods-evidence-emulator/**` (Team 1). Never `functions/src/index.ts`.
