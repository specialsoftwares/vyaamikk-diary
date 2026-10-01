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

Programme (2026-10-01): isolated G1–G5 source + G6 automated tests/review/device **preparation**. Combined branch `integration/grin-g1-g5-source`. Contract revision `2026-10-01.wave1b`. Team 5 implementation review `070a388` then findings re-review `6f920cd`: M1–M3 and L4 **closed**; finding fixes **approved**. G6 incomplete. Wave 2 T1–T5 source was on combined `2593c2b` and is **not accepted**. Wave 2 corrections W2-01…W2-05 are in flight. Coordinator extracted `src/localDb/applyPendingMigrations.ts` (production v1–v10 orchestrator). T5 `c2ef669` CS-02 evidence-port follow-up is integrated as a test, not independent approval of W2-03. Team 5 independently reproduced W2-01…W2-05 at `6b26903` (`bff108c`); mapping is not closure. PR #30 remains the G1-only draft. Combined GitHub draft PR was not opened (`gh` unauthenticated).

GRIN remains default-off. No main merge, deploy, EAS, Play, or billing activation in this programme.

## Slices

### G1 — Durable server register/reconcile (authorized now)

**Status:** implemented on `integration/grin-g1-persistence` (emulator). Not live. Not production admission. Correction pass after `ee16ed9` closes serial fail-closed validation, line-identity projection, bounded unknown input, commit-after-success logging, retry-code classification, and dedicated adapter typecheck.

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

**Status:** Wave 1 source plus Wave 2 `4b10356` on combined: INJECTED `evidencePort.ts`; **ER-2** `commitState` re-authorizes after blob I/O; **ER-3** isolated Storage SDK tests vs reservation/account/admission. Live Storage/IAM unchanged. Not production admission.

**Acceptance (Wave 1 emulator/FAKE, not live):** untrusted upload rejected until auth/ownership/active ledger pass; original bytes stored off-client under owner-scoped paths; server computes hash and matches the declared digest; link is an event + pointer, never a rewrite of `original`; unauthenticated/cross-owner/pending-deletion denied; no PDF bodies in logs.

**Depends on:** G1 receipt identity. **External:** Cloud Storage rules/IAM (proposal only). **Blocked by:** live Storage/IAM authorization (not in this programme).

### G3 — Durable SQLite outbox

**Status:** Wave 1 source plus Wave 2 `22a848a` on combined: CS-01 SQLITE_HOST+INJECTED G1, **ER-1** `skipStaleCompletion` after await, **ER-4 T3 half** v9→v10 init-sequence test (GRIN-off; `init.ts` not edited). **ER-4 T5 QA** `525233f` (`isGoodsEvidenceEnabled()` false). `offline.ts` remains a labelled in-process fixture. Host tests are `SQLITE_HOST`, not native process-death.

**Acceptance (not implemented now):** durable device queue survives process death; interrupted register recovers via G1 replay/reconcile without a second serial; queue rows are bound to the signed-in owner/account; switching accounts cannot flush another owner’s commands; no locally invented issued numbers.

**Depends on:** G1 reconcile/replay. **Not:** native offline proof from G1 emulator.

### G4 — Receiving / inspection / amendment / EWB / return UI

**Status:** Wave 2 `786f73a` on combined: list/create/detail use labelled `GrinApplicationRepository` (GrinOutbox `listForOwner` / `persistDraftAndQueue`). `issuedNumber` stays null until G1 issues it. App binding still uses a labelled uninjected FAKE G1 port (queue-only until INJECTED server is wired in-app). Amend/QC/EWB/return/pack remain on labelled `GrinFixtureRepository`. AdmissionGate and store-runtime block remain. Pricing/quota unresolved.

**Acceptance (Wave 1 fixtures + emulator mutations, not native):** screens for receiving, inspection, amendment, EWB observation, return/rejection; durable adapters for those commands with the same auth/ledger gates; issued numbers remain immutable; EWB is recorded observation only; supplier-status / GSTR-2B fields stay user assertions unless a later verified connector exists.

**Depends on:** G1 (and G3 for offline capture). Saved Records hub tile not wired.

### G5 — Versioned evidence-pack / PDF export

**Status:** Wave 1 source on `team/grin-t4-product` (`355e575`). Pack screens + `grinPdfAdapter` exist against fixtures. Completeness still fail-closed on missing originals.

**Acceptance (not implemented now):** versioned pack bytes; explicit completeness explanations for missing originals/EWB/QC; footer remains “not a GST document / not ITC determination”; no silent backfill of missing evidence.

**Depends on:** G1–G2 at minimum.

### G6 — Combined device, accessibility, security, operational acceptance

**Status:** Wave 1 matrix `df5f0a5`, implementation review `070a388`, findings re-review `6f920cd` (M1–M3 closed). Wave 2 ER-4/ER-5 `525233f`: GRIN-off v9→v10 SQLITE_HOST QA; CS-01…CS-11 host/injected slices via `runWorkflows.ts` (not `runIds` stubs). Independent W2-01…W2-05 reproductions `bff108c` (not closure). Native/device remains `device_pending`. Must not mark complete from source/emulator tests.

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
