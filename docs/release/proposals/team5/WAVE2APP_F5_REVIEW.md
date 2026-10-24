# Wave 2 application F1–F4 independent review (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

This review executed **integrated production paths** on combined SHA `7623eef446036cb6290e99b4adbe6f14fb19e198`. Team summaries and coordinator narrative were not treated as evidence. The existing `grinScreens.react.mount.test.ts` inert-child mount is **not** the F1 stale-callback proof.

No Team 1–4 production files were edited. Team 5 changed only `tools/grin-acceptance/**`, `docs/release/proposals/team5/**`, and a pointer line in `GRIN_ACCEPTANCE_MATRIX.md`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. Branch: `team/grin-t5-qa`. `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. This branch was not merged to combined or main.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Combined / this review HEAD | `7623eef446036cb6290e99b4adbe6f14fb19e198` | include origin-bind and F2 joined tests in product/interop scripts |
| `origin/integration/grin-g1-g5-source` | `7623eef446036cb6290e99b4adbe6f14fb19e198` | same as HEAD (`merge --ff-only` was a no-op) |
| G1 parent | `c9623ddb282ea3b1365f2bead9088b10a972a770` | fail closed on corrupt serials, unsafe line ids, and pre-commit logs |
| T1 application backend | `4b560cdf8c31630a92226c3f3947a544f32b1ff4` | authorized receipt reads and validate JS callable payloads |
| T2 evidence | `3ddd4f96d5c85d6f21a8cf2ccfb8a043d9e25c31` | retrieve retained originals and assemble F3 pack inputs |
| T3 outbox / session | `fa6d4a7f394970585095faeed655c1333ab030b9` | split live session token from sqlite and persist confirmed projections |
| T4 product | `26b602a637f14602ec241afc5d77291301704329` | bind origin sessions, confirmed versions, and Team 2 pack inputs |
| Coordinator T1 merge | `186fdccaf7555f170f63a1b7cfb3e3e208b0375f` | merge Team 1 authorized receipt reads and validated JS transport |
| Coordinator T3 merge | `a640aaf8c5b7257380193829dd0ba89406a768bd` | merge Team 3 session token and confirmed projection persistence |
| Pack-input export glue | `0da13be004b24ac14d2994fcd1b2c9728c0143f6` | export F3 pack inputs and include pack.injected in G2 unit tests |
| Production JS transport bind | `e6a689bd9923904c0988eec05a15ffaa7a944e76` | bind owner session to Team 1 JS httpsCallable transport |

`node_modules` is a real directory. `functions/node_modules` was **missing** on this worktree; composed tests used a gitignored symlink to `/Users/shivamsaurav/vyd-worktrees/grin-combined/functions/node_modules` (`firebase-admin@13.10.0`). That symlink is not committed.

## HOLDS (inspected on this SHA)

| HOLD | Observation |
|---|---|
| GRIN default-off | `eas.json` does not set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`. Client gate remains `=== "1"`. |
| Purchase-entry flags | `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"` in EAS preview and production. |
| Version | `app.json` `expo.version` `1.0.0`; `android.versionCode` `23`. |
| Legal date | `src/config/legal.ts` `LEGAL_EFFECTIVE_DATE` `2026-07-27`. |
| Functions export | `functions/src/index.ts` has no GRIN / `goodsEvidence` / composed export. |
| Live Rules | live `storage.rules` has no `grinEvidence`; live `firestore.rules` has no `goodsEvidence`. |
| EAS / Play / deploy | not run; not authorized. |
| NATIVE_DEVICE | not claimed. SQLITE_HOST reopen is not process-death. |

## Verdict

Inspected application findings F1–F4 were **re-executed on production paths**. They no longer reproduce at the labelled hosts below. **Wave 2 is still not accepted.**

| ID | Inspected defect | This review at `7623eef` |
|---|---|---|
| F1 | Screen `onSave` recaptured live repo; A→B dispatched A's values on B | **reproduced-then-fixed** (actual admitted bodies: Amend / QC / Return / Create). Mount inert-child is a different proof. |
| F2 | `clientExpectedVersion()` always `0` | **reproduced-then-fixed** (SQLITE_HOST+INJECTED joined register→amend→QC→return→reopen). Not approved from coordinator narrative. |
| F3 | Attachments list-only; placeholder pack | **reproduced-then-fixed** (INJECTED pack A/B + STORAGE_EMULATOR retrieve/link; application `exportPack` calls `assembleEvidencePackInputs`). |
| F4 | Transport composition not emulator-proven | **reproduced-then-fixed** at isolated composed FIRESTORE_EMULATOR + INJECTED JS unit. Source-graph `appBinding.defaultServerPort.unit.test.ts` was re-run and is **not** the emulator proof. |

Remaining gates (below) stay open. Unset-host skip was **not** treated as execution.

## Emulator hosts used

| Suite | Config | Hosts actually set | Project |
|---|---|---|---|
| G1 Firestore | `tools/goods-evidence-emulator/firebase.json` | `FIRESTORE_EMULATOR_HOST=127.0.0.1:8088` | `demo-vyaamikk-grin-g1` |
| T2 Firestore + Storage | `tools/goods-evidence-storage/firebase.json` | `FIRESTORE_EMULATOR_HOST=127.0.0.1:8091` `STORAGE_EMULATOR_HOST=http://127.0.0.1:9200` | `demo-vyaamikk-grin-g2` |

T2 ports **8091 / 9200** were not used for G1. G1 did not bind 8091/9200. No live Rules or Functions deploy.

Chaining note: first T2 `emulators:exec` ran `storage.emulator.test.ts` then `rules.emulator.test.ts` then CS-02, which **re-ran** `storage.emulator.test.ts` on a dirty emulator (`reserved.ok` false at `storage.emulator.test.ts:47`, evidenceId `ev_emu_1` already present). That is a **harness chaining** failure, not a product observation. CS-02 STORAGE_EMULATOR and official `test:goods-evidence-g2-emulator` were re-executed on **clean** emulator processes and both exited 0.

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` unless noted.

### F1 — actual screen callbacks (not mount inert child)

```bash
npx --yes tsx src/screens/grin/grinScreens.origin.bind.test.ts
# SQLITE_HOST; NATIVE_DEVICE=not_claimed
# grinScreens.origin.bind.test.ts: ok
# Production admitted bodies: GrinAmendAdmittedBody / GrinQcAdmittedBody /
# GrinReturnAdmittedBody / GrinCreateAdmittedBody. Captured A's onSave after
# advanceGrinLiveToken(B) / startGrinOwnerSession(B) did not call B.amend /
# B.recordQc / B.dispatchReturn / B.createQueued. Amend also covered A→logout→A.
```

```bash
npx --yes tsx src/screens/grin/grinScreens.react.mount.test.ts
# SQLITE_HOST + mounted-inert (inert child, NOT the F1 body proof)
# store-runtime block: children not mounted; db factory 0; server port factory 0
# flag off: children not mounted; session not started
# grinScreens.react.mount.test.ts: ok
```

### F2 — register through repository / outbox / transport / backend / confirmed local

```bash
# SQLITE_HOST + INJECTED (FIRESTORE_EMULATOR_HOST unset — labelled not_run, not a skip-as-execution)
unset FIRESTORE_EMULATOR_HOST STORAGE_EMULATOR_HOST
npx --yes tsx tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts
# SQLITE_EXECUTION=SQLITE_HOST
# PORT_KIND=INJECTED_PORT
# INJECTED_SOURCE=team1:serverPort.ts
# F2_CONFIRMED_EVENT_VERSION=6
# F2_SERIALS_ISSUED=1
# SQLITE_HOST+INJECTED: ok
# FIRESTORE_EMULATOR_HOST=unset
# EMULATOR_VARIANT=not_run
```

Joined path executed: `GrinApplicationRepository.createQueued` → `GrinOutbox.dispatchDue` (Team 1 INJECTED G1) → confirmed `eventVersion >= 1` → `repo.amend` / `recordQc` / `dispatchReturn` → G1 accepts → sqlite close/reopen + new `GrinOutbox` → effective warehouse `Bay B`, original still `Main godown`. Queued EWB is not confirmed history. Stale `expectedVersion: 1` conflicts. Lost mutate recovers via reconcile/read. Host reopen is not NATIVE_DEVICE process-death.

Production `GrinApplicationRepository.clientExpectedVersion` reads `getConfirmedProjection` and throws `GRIN_NO_CONFIRMED_VERSION` unless `eventVersion` is an integer `>= 1`. Independent SQLITE_HOST proof without the T3 0-rewrite shim:

```bash
npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts
# SQLITE_HOST; expectedVersion from confirmed projection = 7; missing projection does not queue
# exportPack uses assembleEvidencePackInputs; path A incomplete / missingOriginal
# GrinApplicationRepository.test.ts: ok
```

The T3 file still contains `bindRepoAmendToConfirmed` (rewrites body `expectedVersion === 0`). T5 did not edit that file. On this SHA the production repository does not send `0` when a confirmed projection exists, so the shim is leftover glue and was **not** used as the F2 proof.

```bash
firebase emulators:exec --only firestore --project demo-vyaamikk-grin-g1 \
  --config tools/goods-evidence-emulator/firebase.json \
  "npx --yes tsx tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts && \
   npx --yes tsx tools/grin-acceptance/workflows/cs04-concurrent-serials.emulator.test.ts && \
   npx --yes tsx tools/goods-evidence-emulator/composed.emulator.test.ts && \
   npx --yes tsx tools/goods-evidence-emulator/register.emulator.test.ts && \
   npx --yes tsx tools/goods-evidence-emulator/rules.emulator.test.ts && \
   npx --yes tsx tools/goods-evidence-emulator/register.parity.test.ts && \
   npx --yes tsx tools/goods-evidence-emulator/corrections.emulator.test.ts && \
   npx --yes tsx tools/goods-evidence-emulator/mutations.emulator.test.ts"
# HOSTS=127.0.0.1:8088
# F2 SQLITE_HOST+INJECTED: ok; EMULATOR_VARIANT=ran
# CS-04 FIRESTORE_EMULATOR executed (unique serials 000001/000002)
# composed.emulator.test.ts: ok (EMULATOR / not live deploy)
# register / rules / parity / corrections / mutations emulator: ok
```

F2 `EMULATOR_VARIANT` is **register + `readReceipt` confirm only**. Amend/QC/return on Firestore emulator through the application repository was **not** in that variant. Full mutation join remains SQLITE_HOST+INJECTED.

### F3 — categorized original through verification / linkage / retrieval / pack

```bash
npm run test:goods-evidence-g2-unit
# PURE_DOMAIN domain.unit.test.ts: ok
# INJECTED_PORT injected.unit.test.ts: ok
# INJECTED pack.injected.test.ts: ok
#   Path A missing evidence → mayMarkComplete false, explicit gaps
#   Path B Wave-1 originals → mayMarkComplete true, completeness complete, not forced
#   wrong-receipt / corrupt originals stay incomplete
#   invoice reference cannot satisfy commercial_document
# isolation.contract.test.ts: ok
```

```bash
# Clean T2 emulator (8091 / 9200). Do not chain a second storage.emulator.test.ts
# onto the same process after the official pair.
firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 \
  --config tools/goods-evidence-storage/firebase.json \
  "npx --yes tsx tools/grin-acceptance/workflows/cs02-upload-link.injected.test.ts"
# FIRESTORE=127.0.0.1:8091 STORAGE=http://127.0.0.1:9200
# g2-unit + INJECTED replay + storage.emulator.test.ts: ok
# CS-02 executed (INJECTED_PORT + STORAGE_EMULATOR + FIRESTORE_EMULATOR on the clean run)
```

```bash
npm run test:goods-evidence-g2-emulator
# storage.emulator.test.ts: ok (STORAGE_EMULATOR + FIRESTORE_EMULATOR)
# rules.emulator.test.ts: ok (isolated Rules; live Rules unchanged)
```

Application pack: `GrinApplicationRepository.exportPack` calls `assembleEvidencePackInputs` with confirmed cuts and local originals. SQLITE_HOST repository assertions: path A incomplete / `missingOriginal`; ITC `not_determined`; path B `missingOriginal=false` and completeness is `complete` **or** `incomplete` (not forced). Injected pack B is the stricter `mayMarkComplete true` proof.

### F4 — disabled routes, transport, isolation, product/interop, CS

```bash
npm run test:grin-product
# fixture / repository / defaultServerPort (source-graph, not e2e) /
# mount (mounted-inert) / origin.bind / pdf / locale keys: ok
```

```bash
npm run test:grin-interop
# isolation + CS-01 SQLITE_HOST+INJECTED issued GRIN/MAIN/FY2026-27/000001 + F2 joined
# F2 EMULATOR_VARIANT=not_run in this unset-host script run
```

```bash
npm run test:grin-outbox
# outbox isolation + outbox.sqliteHost + migrateGrin.v9Startup.sqliteHost: ok
```

```bash
npx --yes tsx tools/grin-acceptance/startup/v9-v10-grin-off.sqliteHost.test.ts
# SQLITE_HOST; production applyPendingLocalMigrations / initializeLocalDatabase
# flag off throughout; ok
```

```bash
npx --yes tsx src/services/grin/transport/firebaseTransport.unit.test.ts
# ok (INJECTED / not live deploy)
npx --yes tsx src/services/grin/transport/isolation.contract.test.ts  # ok
npx --yes tsx src/goodsEvidence/isolation.contract.test.ts            # ok
npx --yes tsx tools/goods-evidence-emulator/isolation.contract.test.ts # ok
npx --yes tsx tools/grin-interop/isolation.contract.test.ts            # ok
npx --yes tsx src/services/grin/outbox/outbox.isolation.contract.test.ts # ok via test:grin-outbox
```

```bash
npm run test:goods-evidence-g1-unit
# includes composed.injected.unit.test.ts: ok (INJECTED / not live deploy)
# serverPort.injected.unit.test.ts: ok (INJECTED_PORT)
# firebaseTransport + transport isolation: ok
```

CS-03 first execution **failed** at the pre-fence assertion (`dispatchDue(sessionA)` after `beginOwnerSession(B)` expected `issued`; actual `undefined` because `processed=0` / session retired). That is the F1 outbox fence. Team 5 harness updated (allowed path only): stale A `processed=0`; re-bind A; issue as `owner_a`; B still empty; appBinding A→B throws `grin_binding_retired`; FAKE/uninjected port injected so `startGrinOwnerSession` does not construct live Firebase.

```bash
npx --yes tsx tools/grin-acceptance/workflows/cs03-account-change.sqliteHost.test.ts
# SQLITE_HOST; executed after harness update
```

Other CS slices executed (not `runIds.ts` stubs; not matrix row status change):

| Workflow | Labels | Result |
|---|---|---|
| CS-01 interop | SQLITE_HOST + INJECTED_PORT | executed; issued one serial |
| CS-02 | INJECTED_PORT; STORAGE_EMULATOR+FIRESTORE_EMULATOR on clean hosts | executed |
| CS-03 | SQLITE_HOST | executed after harness update (stale A skip + re-bind) |
| CS-04 | INJECTED_PORT and FIRESTORE_EMULATOR `127.0.0.1:8088` | both executed |
| CS-05 / CS-06 / CS-10 | INJECTED_PORT | executed |
| CS-07 | PURE_DOMAIN + INJECTED_PORT | executed (tampered pack incomplete) |
| CS-08 / CS-09 / CS-11 | PURE_DOMAIN | executed; no live GST/2B/EWB portal |
| W2 mutation-keeps-register | SQLITE_HOST | executed |
| ER-4 v9→v10 GRIN-off | SQLITE_HOST | executed via production orchestrator |

`scenarios/cs01-*.test.ts` remain stubs (`assertWorkflowNotExecuted`). They were not treated as e2e execution.

## Labelled evidence (kept distinct)

| Label | What ran |
|---|---|
| PURE_DOMAIN | G2 domain unit; CS-07/08/09/11 domain slices |
| INJECTED_PORT | F2 joined G1 serverPort; G1/G2 injected units; pack A/B; CS-02 replay; CS-04/05/06/10; JS transport unit |
| SQLITE_HOST | origin.bind; F2 join + reopen; CS-01; CS-03; ER-4; v9 startup; outbox host; application repository; mutation-keeps-register |
| FIRESTORE_EMULATOR | G1 `127.0.0.1:8088`: F2 variant, CS-04, composed, register/rules/parity/corrections/mutations. T2 `127.0.0.1:8091` with Storage. |
| STORAGE_EMULATOR | T2 `http://127.0.0.1:9200`: storage.emulator, rules.emulator, CS-02 clean inner run |
| mounted-inert | `grinScreens.react.mount.test.ts` (inert child + admission host). **Not** F1 body proof. |
| NATIVE_DEVICE | not claimed |
| PLAY_INSTALLED | not claimed |

Unset `FIRESTORE_EMULATOR_HOST` on `npm run test:grin-interop` logged `EMULATOR_VARIANT=not_run`. That run was not counted as FIRESTORE_EMULATOR execution. The G1 `emulators:exec` run was.

## Production-path observations (source, not team summaries)

- Admitted bodies used by origin.bind call `originRepo(origin)` / `requireOriginGrinApplicationRepository`. They do not recapture `requireLiveGrinApplicationRepository` at save.
- `src/screens/grin/**` has no `getGrinFixtureRepository` import.
- Production default server port is `createFirebaseJsGrinTransport` (`appBinding.ts`). SQLITE_HOST tests inject FAKE/uninjected. Callables remain unexported, so live dispatch cannot succeed honestly until the export HOLD lifts.
- Pack export uses Team 2 `assembleEvidencePackInputs` plus `assembleManifest` / `mayMarkComplete`.
- Isolated emulator PERMISSION_DENIED logs on client writes are the Rules tests denying client writes; they are not live IAM.

### F1 coverage still open (does not reopen the executed Amend/QC/Return/Create proof)

`GrinEwbScreen` / `GrinPackScreen` use production `@/components/ui` + Expo Router, not `grinSurfaces`. Origin.bind did **not** mount EWB, attachments picker completion, or pack share. Those files call `originRepo(origin)` in source. A→logout→A was executed for amend only.

## Remaining gates (not claimed)

| Gate | State |
|---|---|
| Functions GRIN export | absent from `functions/src/index.ts` |
| Live Storage/Firestore GRIN paths | live Rules have no `grinEvidence` / `goodsEvidence` |
| Mobile JS httpsCallable → Functions emulator | not run (G1 firebase.json is Firestore-only; Functions unexported) |
| F2 Firestore-emulator amend/QC/return through application repository | not in F2 `runEmulatorVariant` (register+confirm only) |
| T3 F2 joined `bindRepoAmendToConfirmed` 0-rewrite shim | leftover in `tools/grin-interop` (T5 did not edit) |
| Application pack path B completeness | repository allows `complete` **or** `incomplete`; injected pack B is `mayMarkComplete true` |
| EWB / picker / pack-share origin.bind | not executed on actual bodies |
| Native capture / TalkBack / process-death | not claimed |
| App G1 live backend | unexported callables; JS transport unit only |
| `android.versionCode` | `23` |
| Purchase-entry / goods-evidence flags | purchase-entry `"0"`; goods-evidence not `"1"` |
| Play installed / Internal Testing / EAS | not authorized |
| Live GST / EWB / 2B portals | never invented |
| GRIN pricing / ordinary-record quota | unresolved policy |
| G6 / billing / public release / Wave 2 acceptance | not accepted |

This review did not merge to main, deploy, enable flags, bump `versionCode`, or edit live Rules.
