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

Programme (2026-10-01): isolated G1–G5 source + G6 automated tests/review/device **preparation**. Combined branch `integration/grin-g1-g5-source`. Contract revision `2026-10-01.wave1b`. Team 5 matrix merged (`df5f0a5`); G1–G5 implementations not approved. PR #30 remains the G1-only draft.

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

**Status:** Wave 1 in progress on `team/grin-t2-evidence` (not live). Domain `evidence.ts` / hash verification exist as simulation; lifecycle ports are in `src/goodsEvidence/ports.ts`.

**Acceptance (not implemented now):** untrusted upload rejected until auth/ownership/active ledger pass; original bytes stored off-client under owner-scoped paths; server computes hash and matches the declared digest; link is an event + pointer, never a rewrite of `original`; unauthenticated/cross-owner/pending-deletion denied; no PDF bodies in logs.

**Depends on:** G1 receipt identity. **External:** Cloud Storage rules/IAM (not in this slice). **Blocked by:** separate review + live Storage/IAM authorization.

### G3 — Durable SQLite outbox

**Status:** Wave 1 source on `team/grin-t3-offline` (`3c1303b`), merged to combined. Coordinator wired `DB_VERSION = 10`. `offline.ts` remains a labelled in-process fixture. Host tests are `SQLITE_HOST`, not native process-death.

**Acceptance (not implemented now):** durable device queue survives process death; interrupted register recovers via G1 replay/reconcile without a second serial; queue rows are bound to the signed-in owner/account; switching accounts cannot flush another owner’s commands; no locally invented issued numbers.

**Depends on:** G1 reconcile/replay. **Not:** native offline proof from G1 emulator.

### G4 — Receiving / inspection / amendment / EWB / return UI

**Status:** Wave 1 in progress on `team/grin-t4-product` (labelled fixtures until Wave 2). Domain commands exist in-memory (`amendFields`, `recordQc`, `dispatchReturn`, `correctReturnDispatch`, `voidWithReason`, EWB histories).

**Acceptance (not implemented now):** screens for receiving, inspection, amendment, EWB observation, return/rejection; durable adapters for those commands with the same auth/ledger gates; issued numbers remain immutable; EWB is recorded observation only; supplier-status / GSTR-2B fields stay user assertions unless a later verified connector exists.

**Depends on:** G1 (and likely G3 for offline capture).

### G5 — Versioned evidence-pack / PDF export

**Status:** Wave 1 in progress on `team/grin-t4-product`. `evidencePack.ts` is a completeness model; export pipeline is not yet wired.

**Acceptance (not implemented now):** versioned pack bytes; explicit completeness explanations for missing originals/EWB/QC; footer remains “not a GST document / not ITC determination”; no silent backfill of missing evidence.

**Depends on:** G1–G2 at minimum.

### G6 — Combined device, accessibility, security, operational acceptance

**Status:** Wave 1 acceptance matrix on `team/grin-t5-qa`. Native/device remains `device_pending`. Must not mark complete from source/emulator tests.

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
| Original evidence bytes + server hash + linkage | G2 | missing |
| `evidence_registered` / `evidence_verified` events | G2 | domain types only |
| Offline capture / durable SQLite outbox / interrupted sync | G3 | `offline.ts` simulated; not SQLite |
| Amend fields | G4 | simulated domain command |
| QC decision / reclassify | G4 | simulated domain command |
| Return/rejection dispatch and correction | G4 | simulated domain command |
| Void with reason (preserve issued number) | G4 | simulated domain command |
| EWB histories / `ewb_observation_recorded` / `ewb_linked` | G4 | simulated; not live EWB |
| Screens: receiving, inspection, amendment, EWB, return | G4 | missing |
| Exception helpers (`grinWithoutInvoice`, GSTR-2B prompts, supplier suspended, amount mismatch, cancelled EWB, …) | G4/G5 | domain helpers only; ITC disposition always `not_determined` |
| Manually recorded GSTR-2B / supplier-status values | G5/G6 | **assertions**, not verified live integrations |
| Versioned evidence-pack / PDF export / completeness explanations | G5 | `evidencePack.ts` model only |
| Device, accessibility, security, operational acceptance | G6 | missing |
| Encrypted PDF backup | backlog | deferred |
| Production GRIN admission / store-runtime flag | later | default-off; not enabled |

Manually recorded GSTR-2B or supplier-status values are **assertions**, not verified live integrations. EWB applicability and ITC eligibility are **not** invented here.
