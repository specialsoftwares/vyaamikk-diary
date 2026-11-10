# Audit correction before the remaining recommendations

This note started on the follow-up at `d9c808ad61d89b8dec7c4c5f91440668abdbc3aa`. The release-candidate correction now explicitly disables the two unsupported public quarantine callables in source. Their serving revisions have not been verified or changed. GRIN purge, the invoice renderer, the Firebase client key and dependency versions remain outside this correction.

The mailbox, phone-factor, and wrong-code fixes in this branch are separate. They are not a reason to apply the items below.

## Quarantine rebind

`rebindQuarantinedMobile` updates the old quarantine and writes a binding, then reads the newer quarantine. A Firestore transaction cannot read after it has written, so that later read aborts the transaction and the mutation does not commit.

Moving that read above the writes, by itself, would let the mutation commit. The former callable authorized `originalUid` when it equalled the caller, or a support claim, without requiring a fresh phone factor for the released number. The release candidate leaves that internal helper and transaction order untouched. `rebindQuarantinedMobileCallable` now rejects every call before any Admin operation: signed-out calls receive `unauthenticated`; signed-in callers, including support claims, receive the same fixed support-required failure. No shipped app caller was found. This is an explicitly unsupported capability, not an implemented rebind flow.

## checkMobileQuarantine

The former `checkMobileQuarantine` ignored the null admission result for signed-out callers. It read the quarantine with the Admin SDK and, when the snapshot was active and due, updated it to released outside a transaction. A later quarantine could be overwritten between that read and write.

No shipped app caller or approved signed-out lookup requirement was found. The release candidate now rejects every invocation before any Admin lookup or release, using the same anonymous/signed-in denial contract as rebind. Internal quarantine checks and transactional release used by login, contact change and deletion are unchanged.

`functions/src/identity/mobileQuarantine.disabledCallables.test.ts` invokes both production exported handlers with anonymous, owner and support contexts. Admin Auth and Firestore entry points are fail-fast tripwires. Before the correction, five of six cases failed, including the anonymous lookup reaching Firestore. After the correction, all six deny without an Admin operation. Existing quarantine policy and session-coverage tests remain required. This is source evidence only: a later controlled deployment and serving-revision verification must confirm the old public handlers are no longer serving before this exposure is closed operationally.

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
