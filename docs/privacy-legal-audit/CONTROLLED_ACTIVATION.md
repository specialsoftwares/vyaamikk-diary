# Controlled activation packet

This is a source packet. It does not provision a database, grant IAM, turn on a flag, migrate, inventory production data, purge, deploy, merge, or publish. Public release remains HOLD. PR #35 remains a draft.

## What initial public release needs

These are the controls the current source already uses, or the one rules deploy that closes the restore window. None of them is performed by this packet.

1. Keep `firestore.rules` and `storage.rules` deployed while sessions are prepared. Write an open reconciled `restoreControl/current`, seed the outside authority with the same watermark, and leave `restoreControl/mode` absent or `required: false`. Turn `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` on only after that fence exists. `mintClientAuthToken` and `readRestoreAuthorityWatermark` do not require the caller to already hold `authorityWatermark`.
2. After new logins, existing sessions, and recovery tokens carry that watermark, deploy `rules/activated/firestore.rules` and `rules/activated/storage.rules`. Those files are the output of `activateFirestoreRestoreRules` and `activateStorageRestoreRules`. They deny a missing fence and they deny a token without a matching watermark. Leaving required mode off does not admit an unmarked token after this deploy. Deploying the files before step 1 is the rejected configuration: an open fence with no required-mode document still denies phone and custom tokens that lack the claim.
3. Leave GRIN client flags unset. A store-or-standalone build with `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1` still stays off unless `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` is exactly `1`. Leave `GRIN_GOODS_EVIDENCE_FUNCTIONS` unset. Every GRIN screen is behind `GrinAdmissionGate`. The seven production callables stay exported and deny unless that server value is exactly `true`.
4. Leave `INCLUDE_GRIN_IN_ACCOUNT_PURGE` false. Do not flip it for this release.
5. Leave `PARTY_LEDGER_FUNCTIONS` unset and `PARTY_LEDGER_SERVER_PROJECTION_ENABLED` false. Client rules deny reads and writes of the four party-ledger collections. The release screen recomputes totals on the device from the source records.
6. New Storage object names are opaque ids. Display filenames stay on the record. Existing objects stay at the paths already stored.
7. Signed Android acceptance remains a device pass after a build. This packet does not start that build.

## What stays a disabled maintenance operation

- `CONTENT_KEY_MIGRATION_ENABLED` stays unset. The durable migration adapters resume only when that value is exactly `true`.
- Key destruction stays unbound. `executeKeyRetirement` returns `retirement_executor_not_bound`.
- Production deletion inventory and purge are not run. The inventory function is read-only and is not granted IAM.
- `RESTORE_PROTECTION_ACTIVE`, `RESTORE_HOLD_DATABASE_ID`, and `RESTORE_AUTHORITY_DATABASE_ID` stay unset. With protection inactive, the current deletion, billing, and was-not-me sweeps still run.
- The GRIN purge flag stays false. A version-2 deletion job already calls the GRIN purge with `force: true`. That is existing deletion behavior for a new deletion request, not a new flag. Legacy jobs do not purge GRIN while the flag is false. Existing GRIN copies therefore remain until such a job runs. Hiding the GRIN screens does not erase them.

## Authority and hold services

- Authority database id: one named database matching `^[A-Za-z][A-Za-z0-9_-]{0,62}$`, not `(default)`, not `default`, and not `FIRESTORE_DATABASE_ID`.
- Seed `authority/restore` with an integer watermark `>= 1`, an erasure list, and withdrawn purposes. Do not copy that document from the primary or from a restored snapshot.
- Hold database: a different named database, document `_restoreHolds/current`. Missing means closed.
- IAM for those databases is database-wide `datastore` read and write for the runtime service account. It is not a document-path condition. The functions write only `authority/restore` and `_restoreHolds/current`.
- Clients cannot read either database. Firestore and Storage rules read primary `restoreControl` only.
- Direct clients are denied during a restored gap only after the activated rules are the deployed rules. `enforceClientFenceFromHold` rewrites the primary fence; it is not the control that covers the interval before that write.
- Initial activation is the sequence above. Disaster recovery is separate: a restored snapshot may delete the control documents and cannot replace the activated rules. During that gap every existing client is denied, including one that still holds the previous watermark. The operator rewrites the fence from the outside authority. Matching claims can read again. A stale claim stays denied until mint runs. Do not deploy the pre-activation rules back.
- `mintClientAuthToken` admits from the fence and the outside authority. It does not read a caller watermark. While the fence watermark is missing and the authority is configured, admission stays unavailable. That is the server hold for the gap, not a requirement that the caller already possess the claim.
- Callables use `assertRestoreTrafficClosed`. Workers use `privilegedWorkerHold`. Both stay inactive until `RESTORE_PROTECTION_ACTIVE=true`.

Failure: a missing or malformed authority document is unavailable. It is not an empty erasure list. A release compare-and-set conflict leaves traffic closed. A fence change between the worker release and the traffic release stops the workers again.

Rollback: write `restoreControl/current.closed=true`, set the outside holds closed, and do not delete erased uids. Do not deploy the pre-activation rules back over the activated rules.

## Watermark publication and session refresh

- Callable `readRestoreAuthorityWatermark` in `asia-south1` calls `assertAdmittedCallableUser` and returns the watermark only.
- The client calls it only when `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH=true`.
- Order for initial activation: seed the authority, write the open reconciled fence, turn the flag on, mint claims for new and existing sessions, observe the claim, then deploy the activated rules. This packet does not turn the flag on and does not deploy those rules.
- One bridge attempt mints at most once. A stale claim is that one mint. A closed fence is not retried. Recovery uses the same mint after the fence is rewritten.

Rollback: turn the flag off. Existing sessions keep the claims they already have. New reads follow the fence.

## Required mode

- Under the pre-activation rules, `restoreControl/mode` `{ required: true }` is optional and is not what the activated files enforce.
- The activated files require the matching claim whether or not that document exists. They also deny a missing fence. Do not weaken either check.

Rollback: set `required` false. Do not delete the fence.

## Controlled migration and deletion inventory

- Migration: `runDurableMigration` stays disabled. Checkpoint identity is the hash of scope and target key. The write fence is checked before each document write. Completion stays false while a quarantined or unresolved row remains.
- Inventory: `createFirestoreInventory` and `createFirestoreInventoryLog`. A partial scan cannot certify zero. An empty completed scan waits for an operator and does not delete.
- IAM, if granted later: database-wide `datastore.entities.get` and `datastore.entities.list`, no delete, no export. The function queries only `users/{job.uid}`. That is not document-path IAM.

## GRIN purge-flag decision

Do not set `INCLUDE_GRIN_IN_ACCOUNT_PURGE` to true for this release.

Affected paths while the flag remains false:

- Retained for a legacy deletion job: `users/{uid}/grinEvidence/`, `grinEvidenceObjectKeys`, `grinEvidenceDerivativeKeys`, and the other ids in `GRIN_FIRESTORE_USER_COLLECTIONS`.
- A version-2 deletion job already purges those paths because `finalPurge` passes `force: true`. Turning the flag on would also purge them for legacy jobs.
- Storage category `grinEvidence` is not in `USER_STORAGE_CATEGORIES`, so the diary storage purge does not delete it as a side effect of the flag.

Tests: `src/goodsEvidence/releaseScope.test.ts` and `functions/src/deletion/grinCleanup.unit.test.ts`. The flag constant remains false.

## Signed Android acceptance

Not started. It needs a release build on a device after the source gate is green. An emulator rules test is not that pass.

## Acceptance record

| Requirement | State |
|---|---|
| GRIN store-runtime exclusion, route gates, server flag, retained-copy list | Source/integration verified |
| GRIN application-level encryption | Not in this release. The store build cannot create or open the module. Existing copies remain until a version-2 deletion job or a later flag decision. |
| GRIN purge flag left false | Source/integration verified |
| Party-ledger client denial and on-device recompute | Source/integration verified. The server projector remains unregistered. |
| Opaque new object names and legacy path reads | Source/integration verified |
| Local account isolation, logout retention, deletion, stale worker, sealed recent searches | Source/integration verified on host SQLite. Native-device process death is awaiting physical-device verification. |
| Activation sequence and the rules artifacts | Source/integration verified. Pre-activation rules admit an unmarked token while the fence is open and required mode is off. The artifacts deny that token, deny a stale claim, admit a matching claim, and deny the restored gap. Production still serves the pre-activation rules. Awaiting controlled cloud verification before that deploy. |
| Production local key store | Source/integration verified against an injected secure store. The native module is `expo-secure-store` with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. A device backup does not receive the key. Physical-device verification is still pending. |
| Retained local payloads | Source/integration verified on host SQLite for diary payloads, drafts, the sync queue, active-route params, master-data values, and insight display metadata. Logout retains them. A missing key does not delete them and does not mint a replacement. |
| Insight join keys, GRIN local tables, and the mock diary | An explicit unresolved product decision. Those copies are not an accepted exception. |
| Authority database, hold database, watermark flag, required mode | Awaiting controlled cloud verification. Not provisioned. |
| Content-key migration and production inventory | Awaiting controlled cloud verification. Adapters are tested on the emulator and stay disabled. |
| Key destruction | Disabled maintenance operation. Not required for readiness. |
| Provider deletion evidence | Awaiting provider evidence |
| Signed Android acceptance | Awaiting physical-device verification |
| Public release | HOLD |
