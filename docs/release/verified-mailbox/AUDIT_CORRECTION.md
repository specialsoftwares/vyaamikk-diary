# Audit correction before the remaining recommendations

This note sits on the follow-up that starts at `d9c808ad61d89b8dec7c4c5f91440668abdbc3aa`. It does not change quarantine rebind, quarantine lookup, GRIN purge, the invoice renderer, the Firebase client key, or dependency versions.

The mailbox, phone-factor, and wrong-code fixes in this branch are separate. They are not a reason to apply the items below.

## Quarantine rebind

`rebindQuarantinedMobile` updates the old quarantine and writes a binding, then reads the newer quarantine. A Firestore transaction cannot read after it has written, so that later read aborts the transaction and the mutation does not commit.

Moving that read above the writes, by itself, would let the mutation commit. The callable still authorizes `originalUid` when it equals the caller, or a support claim, and it does not require a fresh phone factor for the number being released. Authorization and transaction order have to change together. This branch does not reorder the reads.

## checkMobileQuarantine

`assertAdmittedCallableUser` returns null when `request.auth` is missing, and its comment says the callable's unauthenticated path still runs. `checkMobileQuarantine` ignores that result. It reads the quarantine with the Admin SDK and, when the record is active and `releaseAt` is already due, updates it to released outside a transaction.

Nothing in the callable states that a signed-out lookup is a product requirement. Until that is decided, the lookup and the release should stay apart. A release has to re-read the current record and the deadline inside the transaction that writes it. This branch does not change that callable.

## GRIN purge

`INCLUDE_GRIN_IN_ACCOUNT_PURGE` is false, and the list comment says scheduled purge must not delete live GRIN until that flag is turned on. `finalPurge` also treats deletion policy version 2 as requiring GRIN cleanup and calls the purge with `force: true` while the flag is still false. New deletion jobs are version 2.

Those two sentences disagree. Turning the force path off would stop a deletion the version-2 code presents as required. This branch does not change the flag or the force path.

## Invoice renderer

`createRendererServer` accepts POST `/render` and does not check an application credential. The file comment says Cloud Run IAM is the gate. Live IAM, the invoker, and ingress were not read in this correction. Another authentication mechanism is not added here.

## Firebase client key

The historical Android client key remains a scanning finding in an old commit. The current fixture is not that key. Whether the live key has application restrictions was not re-read from the console. Rotation is not assumed, and the alert is not closed.

## Dependencies

Advisory counts are not a count of reachable production bugs. This branch does not upgrade packages. A later pass needs the advisory id, the dependency path, whether the app can reach it, and a compatible fix.

## What this branch does change

Direct client writes can no longer change `businessEmail` or `normalizedEmail`. Recovery and reactivation take the destination from the verified email binding and stop when that binding does not match the profile. Email change and account recovery require a fresh phone ID token instead of a non-empty challenge id and a six-character code. `verifyEmailChallengeAndBind` commits a wrong-code count before it throws, and a recovery challenge cannot bind through that function.

Rules and functions in this branch are source only. They are not deployed.
