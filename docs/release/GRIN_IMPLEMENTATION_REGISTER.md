# GRIN implementation register

Owner-selected release scope (2026-10-01): complete GRIN, then integrate with the accepted Android candidate, then Internal Testing after **separate** build authorization. Encrypted PDF backup remains backlog. Billing activation remains unauthorized.

Core candidate stays frozen:

| Role | SHA |
|---|---|
| Application | `6e3dbba9b2173fbb5ffde8ffbbccd5b7dac3e559` |
| Docs | `8b286ab9427383f55fee7519eeb61f3f16a53054` |
| Domain contract | `55f2df1405c296336eea058238c8ae24e7a8b370` (PR #27, support policy v2) |
| Core CI | run `36874104343` / job `110408998132` / merge-ref `f922e2b1da988de30782818905bdf7dc72bfecb9` |

The core-only Internal build packet is **deferred**. VersionCode 23 is source preparation, not a reservation or build approval.

This register is not GRIN-complete from G1.

Programme (2026-10-01): isolated G1–G5 source + G6 automated tests/review/device **preparation**. Combined branch `integration/grin-g1-g5-source`. Contract revision `2026-10-02.wave2evidence`. Team 5 implementation review `070a388` then findings re-review `6f920cd`: M1–M3 and L4 **closed**. Wave 2 W2-01…W2-05 PHASE 2 `3fe4071` of `e94b78c`. Application F1–F4 independently reviewed by Team 5 F5 `889f011` of `7623eef` as **reproduced-then-fixed**. E1–E5 PHASE 1 reproduced at `41670aa` / `4711f7d`. T5 PHASE 2 rereview `049e7e0` of `ae0339a`: E1–E3/E5 pass; E4 remaining there. Coordinator source closeout after PHASE 2 then T5 PHASE 3 `d3d48fc` of `d4b6e1f`. Joined `persistGrinOwnerSession` → isolated Functions-emulator `httpsCallable` executed on combined (not yet independently re-executed by Team 5). **Wave 2 is not accepted.** Functions unexported; live Rules unchanged; native/Play/GST/2B open. PR #30 remains the G1-only draft. Combined GitHub draft PR: `gh` unauthenticated — compare `main...integration/grin-g1-g5-source`.

GRIN remains default-off. No main merge, deploy, EAS, Play, or billing activation in this programme.

## Slices

### G1 — Durable server register/reconcile (authorized now)

**Status:** implemented on `integration/grin-g1-persistence` (emulator). Not live. Not production admission. Correction pass after `ee16ed9` closes serial fail-closed validation, line-identity projection, bounded unknown input, commit-after-success logging, retry-code classification, and dedicated adapter typecheck.

**W2-06 (undeployed, on combined after `cbcb1b9` + `e6a689b` + `4b560cd`):** `functions/src/goodsEvidence/composed.ts` runs register/reconcile/mutate/`readReceipt` from authenticated `request.auth.uid` when tests inject the adapter and `GRIN_GOODS_EVIDENCE_FUNCTIONS` is exactly `"true"`. `callables.ts` stays fail-closed. Mobile `src/services/grin/transport/` parses remote shapes before acceptance (no firebase-admin). App binding production default is `createFirebaseJsGrinTransport()`; SQLITE_HOST tests inject FAKE. `functions/src/index.ts` still has no GRIN export.

- Server-authoritative serial + IST FY; malformed existing counters return `integrity` (no coercion); exhaustion is `serial_exhausted`
- Immutable issued snapshot, first event, command digest/result, initial projections
- Line IDs: ordinary ids including `toString` persist as own keys; `__proto__` / `constructor` / `prototype` rejected
- Auth / owner / active-account / ledger / admission config
- Replay, digest_conflict, receipt_exists, reconcile not_found vs generic deny
- Isolated emulator Rules (not deployed)
- `npm run typecheck:goods-evidence-g1` is part of `ci:verify`

**Acceptance:** see `tools/goods-evidence-emulator/ARCHITECTURE.md` and G1 tests.
**Not proven:** production load, native offline, Storage, legal evidentiary sufficiency. Test clocks are not live commit timestamps. `firestoreCommitTime` remains null.

### Live billing (read-only, 2026-10-01)

Billing prepare/validate/RTDN/worker handlers **exist** (Cloud Functions v2 `asia-south1` ACTIVE). `functions:config:get` `{}` does **not** prove `PLAY_BILLING_ENABLED=false`. Effective flag strings were **absent** from those handlers’ env and secret keys; enablement is **unknown**. See `docs/release/BILLING_OPS_DEPLOY_MANIFEST.md`. Activation is not authorized.

### G2 — Protected original evidence upload

**Status:** Wave 2 W2-03/W2-04 `06d897a` plus F3 `3ddd4f9` on combined: evidence identity on replay; missing/invalid category fails; isolated Storage original **read** of retained `uploaded_unverified`/`verified`/`linked` is separate from upload admission; `retrieveOriginal` / pack-input assembly (`assembleEvidencePackInputs`) for confirmed cuts. Team 4 `exportPack` calls those inputs. Live `storage.rules` unchanged. ER-2 `commitState` re-authorization kept.

**Acceptance (Wave 1 emulator/FAKE, not live):** untrusted upload rejected until auth/ownership/active ledger pass; original bytes stored off-client under owner-scoped paths; server computes hash and matches the declared digest; link is an event + pointer, never a rewrite of `original`; unauthenticated/cross-owner/pending-deletion denied; no PDF bodies in logs.

**Depends on:** G1 receipt identity. **External:** Cloud Storage rules/IAM (proposal only). **Blocked by:** live Storage/IAM authorization (not in this programme).

### G3 — Durable SQLite outbox

**Status:** Wave 2 W2-02/W2-05 `9a0de6d` on combined: unique `lease_attempt_id`; same worker cannot reclaim a live lease; retirement checked before ambiguous reconcile; `persistMutationAndQueue` + `listForOwnerAndLedger`; category column on local evidence files. W2-05 tests call `applyPendingLocalMigrations` / `initializeLocalDatabase`. Host tests are `SQLITE_HOST`, not native process-death. `offline.ts` remains a labelled in-process fixture.

**Acceptance (not implemented now):** durable device queue survives process death; interrupted register recovers via G1 replay/reconcile without a second serial; queue rows are bound to the signed-in owner/account; switching accounts cannot flush another owner’s commands; no locally invented issued numbers.

**Depends on:** G1 reconcile/replay. **Not:** native offline proof from G1 emulator.

### G4 — Receiving / inspection / amendment / EWB / return UI

**Status:** Wave 2 W2-01 `decac00` plus F1 `26b602a` on combined: `startGrinOwnerSession` is the only session starter; admitted bodies bind originating uid+generation; `requireLiveGrinApplicationRepository` is not used at save. Amend/QC/EWB/return/attachments/history/pack/exceptions use `GrinApplicationRepository`. Transport `e6a689b` wires JS httpsCallable. F2: `expectedVersion` from confirmed projection or `GRIN_NO_CONFIRMED_VERSION`. Pricing/quota unresolved. T5 F5 mounted Amend/QC/Return/Create; EWB/picker/pack-share bodies not mounted.

**Acceptance (Wave 1 fixtures + emulator mutations, not native):** screens for receiving, inspection, amendment, EWB observation, return/rejection; durable adapters for those commands with the same auth/ledger gates; issued numbers remain immutable; EWB is recorded observation only; supplier-status / GSTR-2B fields stay user assertions unless a later verified connector exists.

**Depends on:** G1 (and G3 for offline capture). Saved Records hub tile not wired.

### G5 — Versioned evidence-pack / PDF export

**Status:** Wave 2 `decac00` plus F3 `26b602a`: `exportPack` calls `assembleEvidencePackInputs` from confirmed cuts and local verified originals. Completeness is never forced. ITC `not_determined`. Fixture repository remains test-only.

**Acceptance (not implemented now):** versioned pack bytes; explicit completeness explanations for missing originals/EWB/QC; footer remains “not a GST document / not ITC determination”; no silent backfill of missing evidence.

**Depends on:** G1–G2 at minimum.

### G6 — Combined device, accessibility, security, operational acceptance

**Status:** Wave 1 matrix `df5f0a5`, implementation review `070a388`, findings re-review `6f920cd` (M1–M3 closed). Wave 2 ER-4/ER-5 `525233f`. Independent W2-01…W2-05 PHASE 2 `3fe4071`. Independent F1–F4 F5 `889f011` of `7623eef` (reproduced-then-fixed at labelled hosts; Wave 2 not accepted). Coordinator typecheck glue + local canonical `ci:verify` PASS at `99ee60ceba2f7f4adec01f4e3559c485608687ac` (`test:all` 152/152; G1/G2 emulator suites executed). Local invoice-renderer Docker skipped (`docker not available`). GitHub Actions CI not executed (`.github/workflows/ci.yml` is `main` / PR-to-`main` / `workflow_dispatch` only). Native/device remains `device_pending`. Must not mark complete from source/emulator tests.

**Acceptance (not implemented now):** Play-installed binary; TalkBack on GRIN screens; account switch and pending-deletion; safe diagnostics; operational runbook. Must not mark Done from source/emulator tests.

**Depends on:** authorized Internal Testing build after G1–G5 as required by review.

## Field / exception map

| Capability | Slice | State |
|---|---|---|
| Buyer legal name / GSTIN / address | G1 | implemented (emulator snapshot) |
| Supplier name / registration / address / contact | G1 | implemented (emulator snapshot); registration is an assertion, not a live GST portal status |
| Commercial invoice/PO/challan/value/missing-document reason | G1 | implemented (emulator snapshot) |
| Lines: HSN, quantities, weights, shortage/excess, condition, line QC | G1 | implemented (emulator snapshot); line QC later mutated in G4 |
| Custody, warehouse, location bin | G1 | implemented (emulator snapshot); later custody changes G4 |
| Receiving / QC employee **attributed** text | G1 | implemented (emulator snapshot); not employee sharing or IAM roles |
| Acknowledgement outcome/statement | G1 | implemented (emulator snapshot) |
| Capture provenance, client captured-at, reported arrival + TZ | G1 | implemented (emulator snapshot); FY/serial use **server** instant, not reported arrival |
| Server serial, issued number, IST FY, original snapshot hash, first event | G1 | implemented (emulator) |
| Command idempotency / digest / receipt identity / reconcile | G1 | implemented (emulator) |
| EWB link on register (`ewb: none` or recorded observation) | G1 | stored as submitted observation; **not** statutory applicability or live portal verification |
| Original evidence bytes + server hash + linkage | G2 | Wave 1 emulator/FAKE; not live Storage |
| `evidence_registered` / `evidence_verified` events | G2 | domain + emulator link event; not live |
| Offline capture / durable SQLite outbox / interrupted sync | G3 | SQLite v10 + SQLITE_HOST tests; `offline.ts` fixture remains; not native death |
| Amend fields | G4 | emulator adapter + fixture UI |
| QC decision / reclassify | G4 | emulator adapter + fixture UI |
| Return/rejection dispatch and correction | G4 | emulator adapter + fixture UI |
| Void with reason (preserve issued number) | G4 | emulator adapter + fixture UI |
| EWB histories / `ewb_observation_recorded` / `ewb_linked` | G4 | emulator observation; not live EWB |
| Screens: receiving, inspection, amendment, EWB, return | G4 | gated fixture screens; Saved Records tile not wired |
| Exception helpers (`grinWithoutInvoice`, GSTR-2B prompts, supplier suspended, amount mismatch, cancelled EWB, …) | G4/G5 | domain helpers only; ITC disposition always `not_determined` |
| Manually recorded GSTR-2B / supplier-status values | G5/G6 | **assertions**, not verified live integrations |
| Versioned evidence-pack / PDF export / completeness explanations | G5 | fixture pack + grinPdfAdapter; missing original remains incomplete |
| Device, accessibility, security, operational acceptance | G6 | matrix + device_pending scripts; not executed |
| Encrypted PDF backup | backlog | deferred |
| Production GRIN admission / store-runtime flag | later | default-off; not enabled |

Manually recorded GSTR-2B or supplier-status values are **assertions**, not verified live integrations. EWB applicability and ITC eligibility are **not** invented here.
