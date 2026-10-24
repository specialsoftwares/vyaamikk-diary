# Restore authority provisioning packet

This is a review packet. The database is not created, no IAM binding is applied, and required mode stays inactive.

## Why a marker inside the restored database is not enough

A restored primary snapshot can omit `restoreControl/current` and `restoreControl/mode`. Client Rules then see no closed fence and no required mode. The outside snapshot is the control that still lists erased uids and withdrawn purposes. Opening traffic also requires the local fence to be rewritten with `closed: false`, `reconciled: true`, and the same watermark as that outside snapshot. Until that rewrite, required mode cannot admit, and a closed fence denies every token.

## Database and seed

- Create one named Firestore database whose id matches `^[A-Za-z][A-Za-z0-9_-]{0,62}$`.
- Do not use `(default)`, `default`, or `FIRESTORE_DATABASE_ID`.
- Seed exactly one document, `authority/restore`, before setting `RESTORE_AUTHORITY_DATABASE_ID`:
  - `watermark`: integer `>= 1`
  - `erasedUids`: array of non-empty strings, initially `[]` only for a brand-new authority, never by copying a restored primary
  - `withdrawnPurposes`: object of uid to arrays of purpose strings
- Do not initialise this document from the primary database or from a restored snapshot. A missing or malformed seed makes projection throw `restore_authority_unprovisioned` or `restore_authority_projection_failed` and leaves local completion in `needs_manual_review`.

## Readers and writers

- Runtime service account: `datastore` read and write on this database. Firestore IAM does not restrict that role to the `authority/restore` path. The projection function writes only that document.
- No client SDK access. Rules on the primary database cannot read this database.
- Operators who reconcile get a separate role that can update the watermark. They do not get primary-database admin.
- Backup: scheduled export of this one document, retained for the life of every erasure decision it records. Restoring the primary does not restore or roll back this document.

## Projection

- `projectRestoreAuthority` merges one uid or purpose into the current valid snapshot and retries when `compareAndSet` conflicts.
- The watermark is not changed by a withdrawal or an erasure.
- Concurrent merges must both remain. A conflict retries from the new snapshot instead of writing the stale one.
- Five failed compare-and-set attempts throw `restore_authority_write_failed` (transient). The local completion transaction has not run yet.
- Idempotent: projecting the same uid or purpose again does not duplicate it.

## Admission

- A closed fence denies every token.
- While the authority database is unset and required mode is off, admission is `skip`. That is the current production state.
- Once the authority is configured, a missing snapshot does not mint an unmarked token (`unavailable`).
- An open fence that is not reconciled still `skip`s when required mode is off, so sign-in is not blocked before reconciliation. Required mode makes that state `unavailable`.
- A configured, open, reconciled fence whose watermark matches the authority `admit`s even while required mode is off. The claim is `authorityWatermark`. A mismatched watermark is `deny`.
- `mintClientAuthToken` keeps `vydOriginAuthTime` and adds the watermark only on `admit`.
- Recovery tokens keep `recoveryDeviceId` and `recoverySession`, with the same watermark rule.
- Phone ID tokens are minted by Firebase Auth and do not receive the claim. The supported transition is the existing JS bridge: native phone session, then `mintClientAuthToken`, then `signInWithCustomToken`.
- Existing JS sessions are reused until `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH=true`. That flag stays off. When it is on, the bridge calls `readRestoreAuthorityWatermark`. A positive `authorityWatermark` is fresh only when that callable returns the same integer. One bridge attempt mints at most once. If the replacement is still obsolete, it stops. A closed fence denies the mint and is not tried again.
- Do not turn the refresh flag on until the callable can read a current `authority/restore` document. Until that document is published, the flag-on path cannot prove freshness and does not treat a positive claim as current. The callable returns the watermark only. It does not return the erasure list, and a missing or malformed document is not an empty list.
- `deny` and `unavailable` fail the mint or recovery call. They do not issue an unmarked token.

## Paths that read or recreate protected data

- Callable handlers covered by `callableSessionCoverage` call `assertAdmittedCallableUser` before reading or writing user data. Schedulers do not call that helper.
- `scheduledDeletionCleanup` checks the worker hold before it opens Firestore. `RESTORE_WORKER_HOLD=stopped` returns before any user or job read. While `RESTORE_PROTECTION_ACTIVE` is unset, an unset hold still lets the sweep run. Once protection is active, a missing or stopped outside hold also stops it. When it runs, it deletes an account that is already in the deletion queue. It does not create diary, credit, purchase-order, or pack documents.
- `scheduledBillingReconciliation` checks the same hold before the billing flag. `stopped` returns before Firestore is opened. When it runs, it reads the billing queue and drops uids listed in `RESTORE_ERASED_UIDS`. That list is empty until it is published from the outside authority. The cycle does not write diary content.
- `handleWasNotMeTokenHttp` checks the same hold before it reads. `stopped` returns `restore_hold`. When it runs, it updates `wasNotMeTokens` and `newDeviceSecurityEvents` only. Those collections are not business documents, so the handler cannot recreate them.
- Client Firestore and Storage rules read `restoreControl` on the primary database. They cannot read the outside hold. A stored closed hold stops those clients only after `enforceClientFenceFromHold` writes `restoreControl/current.closed`. Required mode denies a token whose watermark does not match. A snapshot that omits `restoreControl` does not clear the outside hold.

## A restored primary cannot reopen itself

`releaseRestoreHolds` reads the local fence and mode, and the outside hold store. If either local document is missing, it leaves the holds closed and does not write them open. The first successful call releases workers and leaves traffic closed. A later call re-reads the fence and the authority watermark before it opens traffic. A fence or authority change rolls workers back to stopped. A concurrent close or a revision conflict does not open traffic. `restoreServiceCanReopen` only classifies booleans. It is not this control.

## Initial activation

This is the first time the authority exists. Do not close the fence in order to mint.

1. Confirm `authority/restore` was seeded on the outside database, not copied from the primary.
2. Write `restoreControl/current` with `closed: false`, `reconciled: true`, and the same watermark, and write `restoreControl/mode` with `required: false`.
3. Issue admitted custom tokens. A closed fence would deny this mint, so closing is not a step here.
4. Observe that those sessions carry the watermark.
5. Set `required: true` only after that observation.
6. Confirm `readRestoreAuthorityWatermark` returns that watermark, then turn `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` on. This packet does not turn the flag on.

## Disaster recovery

The outside holds are already closed. They are not inside the snapshot.

1. Keep client traffic and `RESTORE_WORKER_HOLD=stopped`.
2. Confirm `authority/restore` still has every erased uid and withdrawn purpose. Do not copy it from the restored primary.
3. A restored snapshot without both `restoreControl` documents cannot release the holds. An operator may write a closed local fence while the holds stay closed. That closed fence still denies minting.
4. Rewrite the fence with `closed: false`, `reconciled: true`, and the same watermark as the outside snapshot.
5. Issue admitted tokens only after that rewrite. Do not mint while the fence is closed.
6. Call `releaseRestoreHolds` once. It starts workers and leaves traffic closed. Confirm the fence still matches the authority, then call it again to open traffic. Required mode stays off until admitted tokens are observed. A change between the two calls rolls the workers back and does not open traffic.

Rollback of a bad open is a new closed fence plus the outside holds. It does not delete erased uids. Old tokens fail the closed fence.
