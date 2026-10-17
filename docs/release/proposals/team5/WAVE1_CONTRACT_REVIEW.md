# Wave 1 CONTRACT review (Team 5)

Reviewed files (not an implementation report):

- `docs/release/GRIN_INTERFACE_CONTRACT.md` revision `2026-10-01.wave1`
- `src/goodsEvidence/ports.ts` (`GRIN_CONTRACT_REVISION = "2026-10-01.wave1"`)
- Supporting shapes actually referenced by those two: `src/goodsEvidence/command.ts`, `types.ts`, `canonical.ts`, `evidence.ts`, `offline.ts`, `evidencePack.ts`, `exceptions.ts`, `ewb.ts`, `validate.ts`, `constants.ts`, `featureFlag.ts`, `tools/goods-evidence-emulator/ARCHITECTURE.md`

This is an independent QA reading. It does **not** approve G1–G5 implementations. It does **not** complete G6.

## Alignments worth keeping

- Identifier charset, auth-uid-over-body, deny codes, replay/`digest_conflict`/`receipt_exists`, and the G1 admission matrix are written once in the contract and mirrored in `ports.ts` / G1 `ARCHITECTURE.md`.
- Canonical JSON rules (sorted keys, explicit nulls, omit undefined object properties, reject array holes, exclude `firestoreCommitTime`) are stated in both the contract and `CanonicalizationNotes`.
- Evidence, outbox, and pack state names exist as types in `ports.ts` (`EvidenceObjectState`, `OutboxLocalState`, `PackCompletenessLabel`).
- Unresolved pricing, retention, production admission, encrypted backup, and live EWB/2B connectors are explicitly not-to-invent.

## Gaps

1. **`GrinCommandType` vs `GoodsCommandType`.** Ports include `recordEwbObservation` and `linkVerifiedEvidence`. `command.ts` does not. There are no command body types for those two operations. Teams cannot freeze/digest them without inventing a shape.

2. **Events without commands.** `GrinEventType` includes `acknowledgement_recorded`, `stock_reference_recorded`, `payment_reference_recorded`, `rejection_recorded`, `return_received`, `exception_resolved`, `evidence_registered`, and `evidence_verified`. The contract says command types are `GrinCommandType`. It does not say which command (or adapter side-effect) emits each event. `linkVerifiedEvidence` is the only evidence command, so `evidence_registered` vs `evidence_verified` is unspecified.

3. **Reconcile is not a port.** The contract requires lost-response recovery via stored command result or reconcile. `ports.ts` has no `ReconcileRequest` / `reconcileGoodsReceipt` signature. G1 implements `reconcile({ ledgerId, commandId })` in the emulator adapter only.

4. **Mutation replay via reconcile is unspecified.** G1 `storedSuccess` requires register fields (`issuedNumber`, `serial`, …). A stored `GrinMutationResult` would fail that parser and become `not_found`. The contract still says mutations recover via reconcile.

5. **Mutation admission flag.** “Mutations use `newCommands` the same way as register” is stated. Whether reconciling a mutation uses `reconciliation` or `newCommands` is not. Wave 2 cannot code CS-05/CS-10 for mutations from the contract alone.

6. **Unknown receipt on mutation.** Contract `not_found` is defined for authorized missing **commands**. Simulated `ledger.ts` returns `invalid` for an unknown receipt. Ports do not say `not_found` vs `invalid` vs `forbidden` for a mutation against a missing receipt (existence leak if the code differs by owner).

7. **Two evidence state machines.** Ports: `reserved → … → linked`. `evidence.ts`: `EvidenceVerification = pending | failed | verified`. No mapping. Completeness badges (`evidenceCompleteness`) cannot be tested against `EvidenceObjectState` without an invented table.

8. **Outbox vs `offline.ts`.** Ports define eight `OutboxLocalState` values and `dispatchGeneration`. `offline.ts` only has `registrationStatus: "pending"`. The contract does not specify SQLite schema, uniqueness of `(ownerUid, ledgerId, commandId)`, or who increments `dispatchGeneration`.

9. **Pack completeness is three axes in code, one in ports.** `PackCompletenessLabel` is `complete | incomplete`. `evidencePack.ts` also has `integrity` and `coverage`. Contract says never label incomplete as complete, which `evaluatePackCompleteness` ANDs, but ports do not require callers to persist the three axes.

10. **`VerifiedEvidenceResult.category` is `string`.** Pack policy v2 keys off `EvidenceCategory`. A Team 2 result could name a category the pack cannot accept. The contract does not bind the two.

11. **Exception rule ids vs functions.** `exceptions.ts` lists ten `ExceptionRuleId`s and implements two functions. Contract + register say 2B/supplier values are assertions and ITC stays `not_determined`. Unclear whether G4 must ship the other eight evaluators or may leave them typed-only.

12. **Retention vs local outbox.** Server retention after `pending_deletion` is unresolved. Offline contract says retirement must not silently delete unsynchronised local evidence. Those can diverge; no required behaviour when a retired account later signs in on a device that still has a queue.

13. **Live Rules proposal path.** Team 2 has `docs/release/proposals/team2/storage.rules.grin.md`. There is no Team 1 firestore.rules proposal path in `GRIN_FILE_OWNERSHIP.md`. Production `firestore.rules` has no `goodsEvidence` matchers (unmatched paths deny by default). The contract does not say when a live Rules change may be proposed.

14. **`GrinDeny.detail`.** Auth table says generic deny / no existence leak, but every deny carries `detail: string`. Bound, allowlist, and whether clients may surface `detail` are unspecified. Logging section forbids raw errors; it does not forbid putting `detail` in UI.

15. **Register vs mutation success shapes.** Register success has `issuedNumber`/`serial`/`serverRegisteredAtUtc` and no `eventId`. Mutation success has `eventId`/`serverAcceptedAtUtc` and no issued number. Client recovery protocol (which fields to persist locally) is not written.

16. **Pack export cut.** Link-is-an-event is clear; whether `assembleManifest` must pin the latest head or an operator-chosen cut is not. Tamper tests (CS-07) need a frozen rule.

## Ambiguities

- **Undefined-object normalize vs `structuredClone`.** Contract requires omitting undefined object properties on a **copy** before digest/validation/persistence. `cloneSnapshot` is `structuredClone` (keeps `undefined`). `canonicalJson` omits at hash time. Required-field validation that runs on the clone can still see `undefined` and return `invalid` even when the digest would match an omitted-key command. Team 1 still owns this; the contract and current G1 adapter disagree.

- **Domain `disabled` vs adapter `policy_denied`.** `CommandAdmission` includes `disabled`; `GrinDenyCode` does not. InMemory ledger uses `disabled` for production-mode simulation. Mapping for a packaged callable is unstated.

- **Owner/ledger mismatch as `digest_conflict`.** Simulated `ledger.ts` `identityError` returns `digest_conflict` for owner/ledger mismatch. Contract auth table says foreign ledger is `forbidden`. Durable adapter vs domain fixture will disagree unless the contract picks one.

- **lineId validation split.** Domain `validate.ts` rejects proto keys only. Emulator `ids.ts` also rejects charset and path tokens (`/`, `.`, `..`). A domain test can admit a `lineId` the adapter will `invalid`.

- **Dual hasher.** `command.ts` / `hashChain.ts` import `@/utils/sha256Hex`. Emulator `hash.ts` uses Node `createHash`. Contract packaging forbids `functions/src` from importing `@/…`. `freezeCommand` cannot ship into Functions as written. Parity tests exist in G1; the contract does not require a packaging-safe freeze helper.

- **Client feature flag vs server admission.** Architecture says the adapter does not consult `isGoodsEvidenceEnabled`. Contract discusses both planes in different sections. SEC-01 needs an explicit sentence: hiding UI is not authorization; server admission still applies if a client calls the callable.

- **FY on mutation.** Serial/FY uses server instant at register. Do amendments that cross FY keep the original issued number (yes, immutable) but stamp `serverAcceptedAtUtc` in the new FY? Stated for register retry; not restated for mutations.

- **`evidenceId` in the identifier table** sits next to G1 register identifiers even though evidence is G2. Harmless if read as forward-looking; easy to over-scope G1 tests.

- **Emulator ports.** File ownership: Team 1 Firestore 8090, Team 2 8091+Storage 9200, G1 historical 8088 until unified. The interface contract is silent. Parallel Wave 1 worktrees can collide on 8088.

- **ITC footer vs pack `itcDisposition`.** Both say not determined. Contract does not forbid a future UI from displaying “eligible” from a 2B assertion. CS-09 should treat any automatic clearance as a fail once UI exists.

## Conflicts

- **Command-type unions** (`GrinCommandType` vs `GoodsCommandType`) — conflict, not just a gap.
- **Undefined-object pre-validation normalize** (contract) vs G1 adapter clone+validate (current code on parent). Contract wins for Team 1 Wave 1; this is not G1 acceptance.
- **Identity mismatch code** (`forbidden` in contract vs `digest_conflict` in `ledger.ts`).
- **Reconcile of mutations** (contract promises recovery; G1 `storedSuccess` cannot parse mutation results).
- **`offline.ts` vs `OutboxLocalState`** (contract points at the enum; the only local helper ignores it).
- **Packaging single-source domain** vs `@/` imports in `command.ts`, `hashChain.ts`, `featureFlag.ts`. `featureFlag.ts` is client-only and should stay out of Functions; freeze/hash cannot.

## What this review does not do

- Does not accept G1 at `c9623dd` or any G2–G5 work.
- Does not treat another agent's review as certification.
- Does not authorize Rules deploy, Functions packaging onto production `index.ts`, or flag enablement.
