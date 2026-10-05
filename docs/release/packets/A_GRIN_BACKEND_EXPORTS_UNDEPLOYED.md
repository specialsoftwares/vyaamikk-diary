# Packet A — Proposed GRIN backend exports (unapplied, undeployed)

Status: **review only**. Not a deploy authorization. Do not edit live
`functions/src/index.ts`, `firestore.rules`, `storage.rules`, IAM, indexes,
secrets, or production flags from this packet.

Existing isolated emulator entry remains
`tools/goods-evidence-emulator/functions-entry/**`. Production
`functions/src/index.ts` stays without GRIN exports until a later owner
authorization.

## Proposed callable exports

Gate: `process.env.GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"` only. Any other
value is deny. Identity is `request.auth.uid` only.

| Export | Role | Rollback if later removed |
|---|---|---|
| `grinRegisterGoodsReceipt` | register | New receipts stop; already-issued numbers remain |
| `grinReconcileCommand` | lost-response | Clients stay `failed_retryable` until restored |
| `grinMutateGoodsReceipt` | amend / QC / return / EWB | Queued mutations stay pending |
| `grinReadGoodsReceipt` | confirmed retrieve | Packs/history cannot refresh confirmed cuts |
| `grinReserveEvidence` / `grinBeginEvidence` / `grinUploadEvidence` | reserve → begin → stored-byte verify → link | In-flight originals stay unverified; local files remain retained |

Do not export Admin SDK or emulator adapters from the production entry.

## Proposed Rules / Storage (still proposals)

- Firestore: existing Team 1 proposal under `docs/release/proposals/team1/` —
  owner-scoped ledgers, admission doc, serial counters. Not merged to live
  `firestore.rules`.
- Storage: existing Team 2 proposal `docs/release/proposals/team2/storage.rules.grin.md`.
  Original create requires a flight reservation; retained read is not gated on
  `newCommands`. Client update/delete denied. Not merged to live `storage.rules`.

## Proposed admission configuration

| Knob | Current | Proposed later change | Consequence |
|---|---|---|---|
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | unset / not `"1"` | `"1"` only on an authorized binary | Still off on Play/store runtimes because of the store-runtime block |
| `isGoodsEvidenceBlockedByStoreRuntime()` | true when `runtimeKind === "store-or-standalone"` | unchanged in this closeout | Play-installed APK cannot open GRIN even if the public env is `"1"` |
| Firestore `goodsEvidenceAdmission/runtime` | not in production | `newCommands` / `reconciliation` allow only for seeded Internal Testing uids | Fail-closed for everyone else |
| `GRIN_GOODS_EVIDENCE_FUNCTIONS` | unexported | `"true"` on the Functions deploy that first exports GRIN | Without it, JS callables stay fail-closed |

## Verification steps (after a later authorized deploy, not now)

1. Isolated emulator round-trip already used as the source proof.
2. Staging project: callables exported, Rules reviewed, App Check as already
   required by other callables.
3. One seeded owner: register → attach → stored-byte verify → pack summary.
4. Confirm live `functions/src/index.ts` SHA matches the authorized export.
5. Confirm purchase-entry flags remain `"0"` until Packet E.

## Rollback

Removing the exports returns clients to fail-closed (`originalDurable false`,
retryable pending). Issued GRIN numbers and linked Storage objects are not
automatically deleted. Retention/deletion after rollback is Packet D.

Do not run `firebase deploy`, EAS, or Play from this packet.
