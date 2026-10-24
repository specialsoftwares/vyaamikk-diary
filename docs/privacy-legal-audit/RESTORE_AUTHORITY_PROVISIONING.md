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

- Runtime service account: `datastore` read and write on this database only, limited to `authority/restore`.
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
- Existing JS sessions are reused until `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH=true`. That flag is off. When it is on, a token without a positive `authorityWatermark` is minted again. Turn the flag on only after the server is issuing claims, and turn required mode on only after those sessions have been observed.
- `deny` and `unavailable` fail the mint or recovery call. They do not issue an unmarked token.

## Paths that read or recreate protected data

- Callable handlers covered by `callableSessionCoverage` call `assertAdmittedCallableUser` before reading or writing user data. Schedulers do not call that helper.
- `scheduledDeletionCleanup` and `scheduledBillingReconciliation` are Admin SDK workers. They are the privileged erasure and billing paths that may run while ordinary client traffic is closed. They are not a way for a client to reopen service.
- `handleWasNotMeTokenHttp` is the HTTP exception that does not use the callable helper. It must not recreate protected diary data.
- Client Firestore and Storage rules remain the read gate for ordinary traffic. A closed fence denies them. Required mode denies a token whose watermark does not match.

## A restored primary cannot reopen itself

`restoreServiceCanReopen` stays closed when `restoreControl/current` or `restoreControl/mode` is absent. It also stays closed while the external traffic hold or the worker hold is closed. Opening requires both local documents and an explicit release of both holds. Restoring a primary snapshot does not release those holds and does not recreate the outside `authority/restore` document.

Recovery if the holds are closed and the local documents are missing:

1. Keep client traffic and the two schedulers stopped.
2. Confirm `authority/restore` still has every erased uid and withdrawn purpose. Do not copy it from the restored primary.
3. Write `restoreControl/current` with `closed: true` before any client traffic.
4. Rewrite that fence with `closed: false`, `reconciled: true`, and the same watermark as the outside snapshot only after the comparison is recorded.
5. Release the worker hold, then the traffic hold. Required mode stays off until admitted custom tokens are observed.

## Open, reconcile, and roll back

1. Confirm `authority/restore` still contains every erased uid and withdrawn purpose. Do not replace it from the restored primary.
2. Write `restoreControl/current` with `closed: true` before any client traffic.
3. Issue admitted custom tokens while required mode is still off. Enable `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` so existing phone sessions mint again.
4. Set `restoreControl/mode` to `{required: true}` only after those sessions are proven to carry the current watermark.
5. Reconcile by writing a new watermark into the outside snapshot and the same watermark into the local fence with `closed: false` and `reconciled: true`.
6. Rollback of a bad open is a new closed fence. It does not delete erased uids. Old tokens, including ones with the previous watermark, fail the closed fence.
