# Controlled activation packet

This is a source packet. It does not provision a database, grant IAM, turn on a flag, migrate, inventory production data, purge, deploy, merge, or publish. Public release remains HOLD. Pull request #35 is merged and closed into `security/firebase-session-hardening` at `8a534a7c748faca83bc28ec39721971d7232e42c`. This follow-up does not merge.

Each phase below has one configuration. A later phase does not reuse an earlier phase's "leave unset" instruction.

## Phase 0 — before admission setup

Nothing in this phase is turned on. This is the configuration of the source packet itself.

- `firestore.rules` and `storage.rules` stay the deployed pre-activation rules. The activated artifacts are not deployed.
- `RESTORE_AUTHORITY_DATABASE_ID` is unset. `RESTORE_HOLD_DATABASE_ID` is unset. `RESTORE_PROTECTION_ACTIVE` is unset.
- `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` is absent from the binary being described. See the build-time section below.
- `restoreControl/current` and `restoreControl/mode` are not written by this packet.
- Workers and callables do not consult the outside authority. Deletion, billing, and was-not-me sweeps keep their current behaviour.

Do not seed the authority in this phase. Admission that requires the authority starts only in phase 1, and phase 1 sets the database id before any client is asked to mint.

## Phase 1 — initial admission setup

This phase prepares sessions. It does not deploy the activated rules and it does not turn on worker protection.

1. Keep the pre-activation `firestore.rules` and `storage.rules` deployed.
2. Create the outside authority database. Its id matches `^[A-Za-z][A-Za-z0-9_-]{0,62}$` and is not `(default)`, `default`, or `FIRESTORE_DATABASE_ID`.
3. Seed `authority/restore` in that database with an integer watermark `>= 1`, the erasure list, and withdrawn purposes. Do not copy that document from the primary database or from a restored snapshot.
4. Set `RESTORE_AUTHORITY_DATABASE_ID` to that database id. From this step onward the authority id stays set. It is not left unset while admission is in progress.
5. Write an open reconciled `restoreControl/current` on the primary database with the same watermark. Leave `restoreControl/mode` absent or `{ required: false }`.
6. Build and install a binary whose `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` is `true`. That value is fixed at build time. It is not flipped on a running server. See below.
7. New login, an existing session, and recovery call `mintClientAuthToken`. The callable does not require the caller to already hold `authorityWatermark`. `readRestoreAuthorityWatermark` likewise does not read a caller watermark.
8. Observe the custom-token claim equals the fence watermark. A stale claim is minted once. A closed fence is not retried.

`RESTORE_HOLD_DATABASE_ID` and `RESTORE_PROTECTION_ACTIVE` stay unset in this phase. Worker protection is phase 3. Required mode is not what admits the claim.

## Phase 2 — activated Rules

After phase 1 has been observed on the clients that must keep working, deploy `rules/activated/firestore.rules` and `rules/activated/storage.rules`. Those files are the output of `activateFirestoreRestoreRules` and `activateStorageRestoreRules`. They deny a missing fence and they deny a token without a matching watermark. Leaving required mode off does not admit an unmarked token after this deploy.

`RESTORE_AUTHORITY_DATABASE_ID` remains the id from phase 1. Do not unset it as part of this deploy.

Deploying these files before phase 1 is the rejected configuration: an open fence with no required-mode document still denies phone and custom tokens that lack the claim.

## Phase 3 — worker and callable protection

This phase is separate from client admission.

- Set `RESTORE_HOLD_DATABASE_ID` to a named database that is not the authority database and not `(default)`.
- Seed `_restoreHolds/current` there. A missing hold document means closed.
- Set `RESTORE_PROTECTION_ACTIVE` to exactly `true`.
- Callables then use `assertRestoreTrafficClosed`. Workers use `privilegedWorkerHold`. Both stay inactive until that value is exactly `true`.

Client rules still read primary `restoreControl` only. They do not read the hold database or the authority database.

## Phase 4 — disaster recovery

Disaster recovery starts only after phase 2. The activated rules stay deployed. A restored snapshot may delete `restoreControl` documents and cannot replace those rules.

- While the fence is missing, Firestore and Storage deny every existing client, including one that still holds the previous watermark.
- `RESTORE_AUTHORITY_DATABASE_ID` is still the phase 1 id. Admission is unavailable while the fence watermark is missing and that id is set. That is the server hold for the gap. It does not require the caller to already possess the claim.
- Rewrite `restoreControl/current` from the outside authority as an open reconciled fence. Do not copy it from the snapshot and do not deploy the pre-activation rules.
- Matching claims can read again. A stale claim stays denied until `mintClientAuthToken` runs against the rewritten fence.

`enforceClientFenceFromHold` rewrites the primary fence. It is not the control that covers the interval before that write.

## Phase 5 — disabled maintenance

These stay off during phases 0 through 4. They are not substitutes for the authority id.

- `CONTENT_KEY_MIGRATION_ENABLED` stays unset. The durable migration adapters resume only when that value is exactly `true`.
- Key destruction stays unbound. `executeKeyRetirement` returns `retirement_executor_not_bound`.
- Production deletion inventory and purge are not run. The inventory function is read-only and is not granted IAM.

## Build-time refresh setting

`EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` is a public Expo value. Metro inlines it when the JavaScript bundle is produced. EAS (or the local release build) must set it in the profile used for that binary. An installed build keeps the value it was built with. Changing a server environment variable, a Firestore document, or a later shell export does not change that binary.

Rollback for the refresh setting means shipping another build without the value. Sessions already minted keep the claims they have. New reads on the new build follow the fence without asking for a refresh. The previous binary continues to refresh until it is replaced.

## What the public release still leaves off

1. Leave GRIN client flags unset. A store-or-standalone build with `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1` still stays off unless `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` is exactly `1`. Leave `GRIN_GOODS_EVIDENCE_FUNCTIONS` unset. Every GRIN screen is behind `GrinAdmissionGate`. The seven production callables stay exported and deny unless that server value is exactly `true`. The store runtime cannot begin a local GRIN session.
2. Leave `INCLUDE_GRIN_IN_ACCOUNT_PURGE` false. Do not flip it for this release. Account deletion on the device still removes that owner's local GRIN rows. Logout does not.
3. Leave `PARTY_LEDGER_FUNCTIONS` unset and `PARTY_LEDGER_SERVER_PROJECTION_ENABLED` false. Client rules deny reads and writes of the four party-ledger collections. The release screen recomputes totals on the device from the source records.
4. New Storage object names are opaque ids. Display filenames stay on the record. Existing objects stay at the paths already stored.
5. Signed Android acceptance remains a device pass after a build. This packet does not start that build.

The GRIN purge flag stays false. A version-2 deletion job already calls the GRIN purge with `force: true`. That is existing deletion behaviour for a new deletion request, not a new flag. Legacy jobs do not purge GRIN while the flag is false. Existing cloud GRIN copies therefore remain until such a job runs. Hiding the GRIN screens does not erase them.

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
- The client calls it only when the installed binary was built with `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH=true`.
- The order is phase 1, then phase 2. This packet does not build that binary and does not deploy the activated rules.
- One bridge attempt mints at most once. A stale claim is that one mint. A closed fence is not retried. Recovery uses the same mint after the fence is rewritten.

Rollback of the refresh behaviour is a new build, described in the build-time section. It is not an instant server switch.

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

## Local key storage: iOS and Android are different

The production adapter asks `expo-secure-store` for `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Expo applies `keychainAccessible` on iOS. That value means the item is available after the first unlock and is not migrated to another device by an iCloud keychain backup. It does not configure Android Auto Backup.

Android evidence already recorded for the versionCode 24 internal artifact (`analysis/android-manifest-evidence/vc24-c931da3d`) is separate:

- `android:allowBackup="true"`.
- `fullBackupContent` and `dataExtractionRules` exclude the `SecureStore` shared-preferences name and include other shared preferences.
- Those XML rules are what keep the Android secure-store entry out of cloud backup and device transfer on that artifact. The iOS constant does not prove them.
- SQLite is not included by those include-only shared-preferences rules on that artifact. That statement is about the versionCode 24 manifest, not a new signed build.

This packet does not rebuild the manifest and does not run a device backup.

## Native acceptance still to execute

Host tests are not this pass. The device packet, after a signed build, is:

| Check | What passing means |
|---|---|
| Secure-store availability | On Android and on iOS, the production adapter stores the key. A missing module surfaces `secure_store_unavailable` and does not write the key to ordinary storage. |
| Upgrade from the previous key store | An existing AsyncStorage `vyd_local_data_key_v1_` value is copied into secure store, read back, then removed. A mismatch is `key_conflict` and both copies stay. |
| Restart and process death | After the process is killed, the same account can open sealed rows. This is not the host SQLite reopen. |
| Logout retention | Logout keeps the key and the unsynchronised rows. |
| Deletion | Account deletion removes that account's key and its local rows, including its local GRIN rows. |
| Reinstall and restore | A cloud restore or a new install does not recreate the device-only key. Sealed local rows that were not backed up are absent. Sealed rows that remain on the device and cannot be opened stay on disk. |
| Missing-key recovery | The app reports the failure and does not delete the rows or mint a replacement key over them. |

Cloud recovery and local-only recovery are different. Diary records that reached Firestore can be read again after a new sign-in on a new install. Unsynchronised local-only records exist only in that device's SQLite or AsyncStorage. Losing the device key, or restoring a backup that does not contain it, does not bring those unsynchronised records back from the cloud. They are not deleted to hide that fact.

## Signed Android acceptance

Not started. It needs a release build on a device after the source gate is green. An emulator rules test is not that pass. The manifest notes above are the versionCode 24 artifact, not this pass.

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
| Production local key store | Source/integration verified against an injected secure store. iOS uses `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. Android backup exclusion is the versionCode 24 SecureStore XML, not that constant. Physical-device verification is still pending. |
| Retained local payloads | Source/integration verified on host SQLite for diary payloads, drafts, the sync queue, active-route params, master-data values, and insight display metadata. Logout retains them. A missing key does not delete them and does not mint a replacement. |
| Insight join keys | Source/integration verified on host SQLite. Party and PIN equality keys and link ids are account-bound tokens. Readable labels stay in the sealed display and metadata. Interrupted migration keeps the remaining plaintext rows and a later run finishes them. |
| GRIN local tables | The store runtime cannot begin a session or read those tables through the party-ledger and insight paths. Bodies stay plaintext. Logout retains rows. Account deletion removes that owner's rows. Cloud copies still follow the purge-flag section. |
| AsyncStorage mock diary | Production firebase mode does not select it. A retained plaintext blob is sealed in place and is not deleted by that seal. A sealed blob is not treated as an empty diary. Account deletion removes the keys. |
| Authority database, hold database, refresh build, required mode | Separate phases. Phase 1 sets the authority id. Phase 3 sets the hold. The refresh value is build-time. Not provisioned by this packet. |
| Content-key migration and production inventory | Awaiting controlled cloud verification. Adapters are tested on the emulator and stay disabled. |
| Key destruction | Disabled maintenance operation. Not required for readiness. |
| Provider deletion evidence | Awaiting provider evidence |
| Signed Android acceptance | Awaiting physical-device verification |
| Public release | HOLD |
