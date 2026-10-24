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

- `decideRestoreAdmission` returns `skip` while `restoreControl/mode.required` is not true, except a closed fence, which denies.
- `admit` copies the reconciled local watermark into `authorityWatermark`. The client does not choose it.
- `mintClientAuthToken` keeps `vydOriginAuthTime` and adds the watermark only on `admit`.
- Recovery tokens keep `recoveryDeviceId` and `recoverySession`, with the same watermark rule.
- Phone ID tokens are minted by Firebase Auth, not by these functions. They do not receive `authorityWatermark`. Required mode must stay off until those sessions are replaced by an admitted custom token.
- `deny` and `unavailable` fail the mint or recovery call. They do not issue an unmarked token.

## Open, reconcile, and roll back

1. Confirm `authority/restore` still contains every erased uid and withdrawn purpose. Do not replace it from the restored primary.
2. Write `restoreControl/current` with `closed: true` before any client traffic.
3. Set `restoreControl/mode` to `{required: true}` only after phone and recovery sessions are proven to receive an admitted token.
4. Reconcile by writing a new watermark into the outside snapshot and the same watermark into the local fence with `closed: false` and `reconciled: true`.
5. Rollback of a bad open is a new closed fence. It does not delete erased uids. Old tokens, including ones with the previous watermark, fail the closed fence.
